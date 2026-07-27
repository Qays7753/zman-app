"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { capitalAsset } from "./db";
import { getCapitalAssetForSource } from "./queries";

// ─────────────────────────────────────────────────────────────────────────
// depreciation/actions — إضافة وقراءة الأصول الرأسمالية المُهلَكة (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// الإهلاك اختياري (خيار γ): لا يُنشأ تلقائياً عند حفظ مصروف/شراء رأسمالي.
// المستخدم يطلب صراحةً إنشاء capital_asset عبر toggle «تصنيف متقدّم» في
// ExpenseForm/PurchaseForm، ثم يختار «توزيع شهري (إهلاك)» + عمر نافع بالأشهر.
//
// الدالة addCapitalAsset تُنشئ صف capital_asset واحد. لا تُعدِّل expense/purchase
// (هذه تظل is_capital_asset=true منفصلة عن capital_asset). الإهلاك غير نقدي:
// لا تُدرَج أي حركة في cash_movement (INV-21 يستثني صراحةً INV-1).
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
 *   4. إدراج الصف. started_at = now() افتراضياً (تاريخ بداية الإهلاك = اليوم).
 *
 * لا تُدرَج حركة cash_movement. الإهلاك غير نقدي (INV-21).
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

    // 4. إدراج الصف. started_at = now() (DEFAULT في DB — راجع depreciation/db.ts).
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

    return { status: "ok", data: row };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

/**
 * حذف ناعم لصف capital_asset (إلغاء الإهلاك مستقبلاً). الإهلاك المُحسَب سابقاً
 * يبقى في P&L التاريخي (لا أثر رجعي — حساب عند القراءة يعني أن الإهلاك يُعاد
 * حسابه في كل قراءة، فالحذف الناعم يوقف الإهلاك من تاريخ deleted_at فصاعداً
 * فقط من حيث المبدأ، لكن لأن حسابنا يستخدم started_at + useful_life_months
 * كحدّ زمني وليس deleted_at كحدّ أعلى، فإن الحذف الناعم يوقف الإهلاك بأكمله
 * بأثر رجعي — راجع INV-5).
 *
 * حالياً لا UI يستدعي هذه الدالة. محفوظة للاستخدام المستقبلي.
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
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}
