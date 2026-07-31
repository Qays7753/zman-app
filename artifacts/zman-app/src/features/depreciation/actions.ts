"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { capitalAsset } from "./db";
import { getCapitalAssetForSource } from "./queries";
// SA1 (A-2 fix — Round 4) — getAmmanDate لرفض تاريخ الشراء المستقبلي.
import { getAmmanDate } from "@/lib/utils";
// Issue #16 — logAction (defensive audit logger). Runs OUTSIDE any caller
// transaction (these functions aren't wrapped in db.transaction), swallows
// ALL errors. addCapitalAsset/deleteCapitalAsset/updateCapitalAsset log an
// audit row on their success path.
import { logAction } from "../audit/actions";

// ─────────────────────────────────────────────────────────────────────────
// depreciation/actions — إضافة وقراءة الأصول الرأسمالية المُهلَكة (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// الإهلاك اختياري (خيار γ): لا يُنشأ تلقائياً عند حفظ مصروف/شراء رأسمالي.
// المستخدم يطلب صراحةً إنشاء capital_asset عبر toggle «تصنيف متقدّم» في
// ExpenseForm/PurchaseForm، ثم يختار «توزيع شهري (إهلاك)» + عمر نافع بالأشهر.
//
// الدالة addCapitalAsset تُنشئ صف capital_asset واحد. لا تُعدِّل expense/purchase
// (هذه تظل is_capital_asset=true منفصلة عن capital_asset). الإهلاك غير نقدي:
// لا تُدرَج أي حركة في cash_movement (INV-22 يستثني صراحةً INV-1).
//
// النتيجة: الصف المُنشأ (يعرض monthlyDepreciationCents للعميل).
// ─────────────────────────────────────────────────────────────────────────

export type CapitalAssetResponse =
  | { status: "ok"; data: { id: string; monthlyDepreciationCents: number; usefulLifeMonths: number } }
  | { status: "error"; message: string };

interface AddCapitalAssetInput {
  sourceType: "expense" | "purchase";
  sourceId: string;
  name: string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseAmountCents: number;
  usefulLifeMonths: number;
}

/**
 * إنشاء صف capital_asset لأصل رأسمالي محدَّد.
 *
 * المنطق:
 *   1. التحقق من المدخلات: usefulLifeMonths >= 1, <= 600 (50 سنة).
 *   2. التحقق من عدم وجود capital_asset نشط مسبقاً لنفس (sourceType, sourceId).
 *      إن وُجد: إرجاع الصف الموجود (idempotency على مستوى المصدر).
 *   3. حساب monthlyDepreciationCents = Math.floor(purchaseAmountCents / usefulLifeMonths).
 *      Math.floor (لا Math.round) لتفادي إهلاك أكثر من 100% من قيمة الأصل.
 *   4. إدراج الصف. started_at = purchaseDate (validated input — SA1 A-2 fix).
 *
 * لا تُدرَج حركة cash_movement. الإهلاك غير نقدي (INV-22).
 *
 * @returns الصف المُنشأ مع monthlyDepreciationCents للعرض في الـ UI.
 */
export async function addCapitalAsset(
  input: AddCapitalAssetInput,
): Promise<CapitalAssetResponse> {
  const {
    sourceType,
    sourceId,
    name,
    purchaseDate,
    purchaseAmountCents,
    usefulLifeMonths,
  } = input;

  // 1. التحقق من المدخلات.
  if (!sourceId || typeof sourceId !== "string") {
    return { status: "error", message: "معرّف المصدر مطلوب" };
  }
  if (sourceType !== "expense" && sourceType !== "purchase") {
    return { status: "error", message: "نوع المصدر غير صالح" };
  }
  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الأصل مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الأصل لا يتعدى 200 حرف" };
  }
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 1) {
    return {
      status: "error",
      message: "العمر النافع يجب أن يكون عدداً صحيحاً موجباً (≥ 1 شهر)",
    };
  }
  if (usefulLifeMonths > 600) {
    return {
      status: "error",
      message: "العمر النافع لا يتعدى 600 شهر (50 سنة)",
    };
  }
  if (!Number.isInteger(purchaseAmountCents) || purchaseAmountCents < 0) {
    return {
      status: "error",
      message: "قيمة الشراء يجب أن تكون عدداً صحيحاً غير سالب (بالفلس)",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return {
      status: "error",
      message: "تاريخ الشراء يجب أن يكون بتنسيق YYYY-MM-DD",
    };
  }

  // SA1 (A-2 fix — Round 4) — ارفض تاريخ الشراء المستقبلي. تاريخ البدء يجب أن
  // يكون اليوم أو قبل اليوم. لا معنى لبدء إهلاك أصل لم يُشترَ بعد. راجع INV-22
  // (الإهلاك = 0 في شهر started_at نفسه؛ أول charge في الشهر التالي).
  const today = getAmmanDate();
  if (purchaseDate > today) {
    return {
      status: "error",
      message:
        "تاريخ الشراء لا يمكن أن يكون في المستقبل — حدّد تاريخاً اليوم أو قبل اليوم",
    };
  }

  try {
    // 2. Idempotency على مستوى المصدر: إن وُجد capital_asset نشط مسبقاً لنفس
    //    (sourceType, sourceId)، أرجِع الصف الموجود. هذا يمنع تكرار الإهلاك
    //    على نفس الأصل (مثلاً: المستخدم يضغط «تأكيد» مرتين).
    const existing = await getCapitalAssetForSource(sourceType, sourceId);
    if (existing) {
      return {
        status: "ok",
        data: {
          id: existing.id,
          monthlyDepreciationCents: existing.monthlyDepreciationCents,
          usefulLifeMonths: existing.usefulLifeMonths,
        },
      };
    }

    // 3. حساب monthlyDepreciationCents = Math.floor(amount / life).
    //    Math.floor (لا Math.round) يضمن أن useful_life_months × monthly_dep
    //    ≤ purchase_amount (لا إهلاك أكثر من 100%). الفرق (residual) يُفقد
    //    ضمناً عند انقضاء العمر — مقبول للأصول منخفضة القيمة.
    const monthlyDepreciationCents = Math.floor(
      purchaseAmountCents / usefulLifeMonths,
    );

    // 4. إدراج الصف. started_at = purchaseDate (validated input — SA1 A-2 fix).
    //    قبل هذا الإصلاح، started_at كان DB-default = now()، أي لحظة قرار
    //    المستخدم، فكانت الأصول القديمة لا تُستهلك بأثر رجعي حتى لو أُدخلت
    //    بـ purchaseDate قديمة. الآن started_at = purchaseDate، فيبدأ الإهلاك
    //    من تاريخ الشراء الفعلي. للأصول القديمة جداً (عمرها > useful_life_months):
    //    months_elapsed ≥ useful_life → CASE «الشهر الأخير يكتسح الباقي» في
    //    getCapitalAssetValuation → NBV = 0 (مُستهلَك بالكامل، صحيح جبرياً).
    //    IC-14 يبقى PASS (NBV ≥ 0). راجع INV-22 / §10 من ACCOUNTING_RULES.md.
    const [row] = await db
      .insert(capitalAsset)
      .values({
        sourceType,
        sourceId,
        name: name.trim(),
        purchaseDate,
        purchaseAmountCents,
        usefulLifeMonths,
        monthlyDepreciationCents,
        // SA1 (A-2 fix — Round 4) — started_at = purchaseDate (وليس DB-default now()).
        // الأصل يبدأ الإهلاك من تاريخ الشراء. الإهلاك = 0 في شهر started_at نفسه،
        // أول charge في الشهر التالي (INV-22 — لا تغيير على SQL).
        startedAt: new Date(`${purchaseDate}T00:00:00Z`),
      })
      .returning({
        id: capitalAsset.id,
        monthlyDepreciationCents: capitalAsset.monthlyDepreciationCents,
        usefulLifeMonths: capitalAsset.usefulLifeMonths,
      });

    if (!row) {
      return { status: "error", message: "فشل إدراج صف الأصل الرأسمالي" };
    }

    // إبطال مفتاح استعلامات التقارير (لأن IC-14 و computeOperatingPnl يتأثران).
    revalidatePath("/finance");
    revalidatePath("/reports");

    // Issue #16 — audit log (defensive, never throws). Only logged on actual
    // INSERT path; the idempotent early-return above (existing asset found)
    // is a no-op retry, not a new creation.
    await logAction({
      action: "create_capital_asset",
      entityType: "capital_asset",
      entityId: row.id,
      changesSnapshot: input,
    });

    return { status: "ok", data: row };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

/**
 * حذف ناعم لصف capital_asset (إيقاف الإهلاك مستقبلاً). الإهلاك المُحسَب سابقاً
 * يبقى في P&L التاريخي (لا أثر رجعي — حساب عند القراءة يعني أن الحذف الناعم
 * يوقف الإهلاك من تاريخ deleted_at فصاعداً فقط من حيث المبدأ، لكن لأن حسابنا
 * يستخدم started_at + useful_life_months كحدّ زمني وليس deleted_at كحدّ أعلى،
 * فإن الحذف الناعم يوقف الإهلاك بأكمله بأثر رجعي — راجع INV-22).
 *
 * D7 fix (SA4): يُستدعى الآن من ExpensesTab/PurchasesTab عبر زر «إيقاف الإهلاك»
 * على الصفوف التي لها capital_asset نشط. كما يُستدعى ضمنياً داخل deleteExpense
 * وdeletePurchase (في finance/actions.ts) لتنظيف الأصول اليتيمة عند حذف المصدر.
 * يُستعمل أيضاً لتفعيل ميزة «التراجع عن قرار التوزيع الشهري» التي كانت مفقودة
 * في Phase 4 (الفشل 3 من review D7).
 */
export async function deleteCapitalAsset(id: string): Promise<{
  status: "ok" | "error";
  message?: string;
}> {
  if (!id) return { status: "error", message: "المعرّف مطلوب" };
  try {
    await db
      .update(capitalAsset)
      .set({ deletedAt: new Date() })
      .where(and(eq(capitalAsset.id, id), isNull(capitalAsset.deletedAt)));
    revalidatePath("/finance");
    revalidatePath("/reports");
    // Issue #16 — audit log (defensive, never throws).
    await logAction({
      action: "delete_capital_asset",
      entityType: "capital_asset",
      entityId: id,
      changesSnapshot: { deleted: true },
    });
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// updateCapitalAsset — تعديل أصل رأسمالي قائم (Issue #11)
// ─────────────────────────────────────────────────────────────────────────
// يسمح بتعديل: الاسم، تاريخ الشراء (startDate)، والعمر النافع فقط.
//
// 🔒 القاعدة الأساسية: لا يمكن تعديل purchaseAmountCents إطلاقاً.
//   - Input type لا يحتوي الحقل أصلاً (ضمان على مستوى TypeScript).
//   - الدالة تجلب الصف الحالي من DB لتأخذ قيمته الأصلية.
//   - monthlyDepreciationCents يُعاد حسابه = floor(amount / newLife).
//
// عند تغيير usefulLifeMonths أو purchaseDate، يُعاد حساب الإهلاك المستقبلي
// عند القراءة (computeOperatingPnl) — لا أثر رجعي على الإهلاك المتراكم
// السابق لأن accumulatedDepreciationCents يُحسب من startedAt + usefulLifeMonths
// في كل قراءة (INV-22). تعديل usefulLifeMonths يغيّر السقف (متى يصل لـ 100%)
// ويُعيد توزيع الفلس المتبقّي على الأشهر المتبقية.
// ─────────────────────────────────────────────────────────────────────────

export type UpdateCapitalAssetResponse =
  | { status: "ok"; data: { id: string; monthlyDepreciationCents: number; usefulLifeMonths: number } }
  | { status: "error"; message: string };

interface UpdateCapitalAssetInput {
  id: string;
  name: string;
  purchaseDate: string; // YYYY-MM-DD — "startDate" في وصف الـ issue
  usefulLifeMonths: number;
}

/**
 * تعديل أصل رأسمالي قائم: الاسم + تاريخ الشراء + العمر النافع فقط.
 *
 * 🔒 لا يقبل purchaseAmountCents إطلاقاً — القيمة الأصلية تُؤخَذ من الصف
 *    الحالي في DB. هذا هو الضمان التقني أن القيمة الأصلية لا تُغيَّر.
 *
 * المنطق:
 *   1. تحقق المدخلات (نفس قواعد addCapitalAsset: name ≤ 200،
 *      usefulLifeMonths 1..600، purchaseDate صيغة YYYY-MM-DD وغير مستقبلي).
 *   2. جلب الصف الحالي WHERE deletedAt IS NULL. إن لم يُوجَد → خطأ.
 *   3. استخدام purchaseAmountCents من الصف الحالي (لا يُقبَل من input).
 *   4. إعادة حساب monthlyDepreciationCents = floor(amount / newLife).
 *   5. تحديث: name, purchaseDate, usefulLifeMonths, monthlyDepreciationCents,
 *      startedAt = new Date(purchaseDate + "T00:00:00Z"), updatedAt = now().
 *   6. revalidatePath /finance و/reports و/assets.
 *
 * @returns الصف المُحدَّث مع monthlyDepreciationCents الجديد للعرض.
 */
export async function updateCapitalAsset(
  input: UpdateCapitalAssetInput,
): Promise<UpdateCapitalAssetResponse> {
  const { id, name, purchaseDate, usefulLifeMonths } = input;

  // 1. تحقق المدخلات — نفس قواعد addCapitalAsset.
  if (!id || typeof id !== "string") {
    return { status: "error", message: "معرّف الأصل مطلوب" };
  }
  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الأصل مطلوب" };
  }
  if (name.trim().length > 200) {
    return { status: "error", message: "اسم الأصل لا يتعدى 200 حرف" };
  }
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths < 1) {
    return {
      status: "error",
      message: "العمر النافع يجب أن يكون عدداً صحيحاً موجباً (≥ 1 شهر)",
    };
  }
  if (usefulLifeMonths > 600) {
    return {
      status: "error",
      message: "العمر النافع لا يتعدى 600 شهر (50 سنة)",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return {
      status: "error",
      message: "تاريخ الشراء يجب أن يكون بتنسيق YYYY-MM-DD",
    };
  }

  // ارفض تاريخ الشراء المستقبلي (نفس قاعدة addCapitalAsset — SA1 A-2 fix).
  const today = getAmmanDate();
  if (purchaseDate > today) {
    return {
      status: "error",
      message:
        "تاريخ الشراء لا يمكن أن يكون في المستقبل — حدّد تاريخاً اليوم أو قبل اليوم",
    };
  }

  try {
    // 2. جلب الصف الحالي. 🔒 نأخذ purchaseAmountCents من هنا — لا من input.
    const [existing] = await db
      .select({
        id: capitalAsset.id,
        purchaseAmountCents: capitalAsset.purchaseAmountCents,
      })
      .from(capitalAsset)
      .where(and(eq(capitalAsset.id, id), isNull(capitalAsset.deletedAt)))
      .limit(1);

    if (!existing) {
      return {
        status: "error",
        message: "الأصل غير موجود أو محذوف",
      };
    }

    // 3. إعادة حساب monthlyDepreciationCents من القيمة الأصلية الثابتة.
    //    Math.floor (لا Math.round) يضمن useful_life_months × monthly_dep
    //    ≤ purchase_amount (لا إهلاك أكثر من 100%). نفس قاعدة addCapitalAsset.
    const monthlyDepreciationCents = Math.floor(
      existing.purchaseAmountCents / usefulLifeMonths,
    );

    // 4. تحديث الصف. startedAt = purchaseDate (يحافظ على الأثر الرجعي الصحيح
    //    للإهلاك — SA1 A-2 fix). updatedAt = now().
    const [updated] = await db
      .update(capitalAsset)
      .set({
        name: name.trim(),
        purchaseDate,
        usefulLifeMonths,
        monthlyDepreciationCents,
        startedAt: new Date(`${purchaseDate}T00:00:00Z`),
        updatedAt: new Date(),
      })
      .where(and(eq(capitalAsset.id, id), isNull(capitalAsset.deletedAt)))
      .returning({
        id: capitalAsset.id,
        monthlyDepreciationCents: capitalAsset.monthlyDepreciationCents,
        usefulLifeMonths: capitalAsset.usefulLifeMonths,
      });

    if (!updated) {
      return { status: "error", message: "فشل تحديث الأصل الرأسمالي" };
    }

    // إبطال مفتاح استعلامات التقارير والـ dashboard (computeOperatingPnl يتأثر).
    revalidatePath("/finance");
    revalidatePath("/reports");
    revalidatePath("/assets");

    // Issue #16 — audit log (defensive, never throws).
    await logAction({
      action: "update_capital_asset",
      entityType: "capital_asset",
      entityId: id,
      changesSnapshot: input,
    });

    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}
