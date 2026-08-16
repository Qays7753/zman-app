"use server";

import { and, eq, isNull, sql, sum, desc, ne, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { idempotencyKey, order } from "../orders/db";
import { getAmmanDate } from "@/lib/utils";
import {
  runFinancialIntegrityCheck,
  type IntegrityReport,
} from "./integrityCheck";
import {
  expense,
  purchase,
  sale,
  purchaseItemCatalog,
  expenseCategoryCatalog,
  account,
  cashMovement,
  ownerTransaction,
  openingBalance,
  receivable,
  receivablePayment,
  type Account,
  type OwnerTransaction,
  type OpeningBalance,
  type Receivable,
  type ReceivablePayment,
} from "./db";
// Phase 3 — value import من catalog/db لجلب الصنف المرتبط في createPurchase.
import { catalogComponent } from "../catalog/db";
// Phase 3 — catalogMovement للحذف الناعم في deletePurchase.
import { catalogMovement } from "../inventory/db";
// D7 fix — capital_asset لتنظيف الأصول المرتبطة عند حذف/تعديل expense/purchase.
// لا FK بين capital_asset وexpense/purchase (تصميم مقصود) — التنظيف يتم هنا
// ضمن نفس الـ transaction لضمان اتساق IC-14 (لا أصول يتيمة).
import { capitalAsset } from "../depreciation/db";
// Phase 3 — inventory: deductForDelivery داخل convertOrderToSale، restoreForReverse
// داخل reverseSale. استيراد دوال فقط (لا DB type) — لا دورة استيراد لأن
// inventory/actions.ts يستورد من finance/db.ts و orders/db.ts (value imports)،
// وfinance/actions.ts يستورد من inventory/actions.ts (functions). لا import type
// من finance/actions.ts في inventory/actions.ts. سلسلة آمنة.
import { deductForDelivery, restoreForReverse, addCatalogMovement } from "../inventory/actions";
import {
  expenseInputSchema,
  purchaseInputSchema,
  saleInputSchema,
  accountInputSchema,
  ownerTransactionInputSchema,
  openingBalanceInputSchema,
  receivableInputSchema,
  receivablePaymentInputSchema,
} from "./schema";
// Issue #16 — logAction (defensive audit logger). Runs OUTSIDE the caller's
// db.transaction, swallows ALL errors. Imported here so every create/update/
// delete function below can record an audit row on the success path.
import { logAction } from "../audit/actions";

// نوع الإرجاع الموحد (Discriminated Union) (§18 rule 8)
export type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

// دالة فحص الـ Rate Limit الموحدة لمنع التكرار (§15.15)
async function checkRateLimit(): Promise<{ success: boolean }> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  return await ratelimit.limit(ip);
}

/**
 * الحصول على الحساب النقدي الافتراضي أو إنشاؤه بشكل تلقائي إذا لم يكن موجوداً
 * لمنع تعطل عمليات البيع/المصاريف (التزاماً بـ §4)
 */
export async function getOrCreateDefaultCashAccount(tx: any): Promise<string> {
  const [existing] = await tx
    .select()
    .from(account)
    .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  // إدراج مباشر (لا onConflict — لا يوجد قيد فريد على account.name في القاعدة،
  // فاستخدام ON CONFLICT (name) يفشل بـ "no unique constraint matching").
  // السباق النادر (tx متزامن ينشئ الحساب) نعالجه بقراءة الحساب مجدداً عند الخطأ.
  let newAccId: string | undefined;
  try {
    const [inserted] = await tx
      .insert(account)
      .values({
        name: "الصندوق الرئيسي",
        type: "cash",
      })
      .returning();
    newAccId = inserted.id;
  } catch {
    // ربما أنشأه tx متزامن — اقرأه مجدداً
    const [existing2] = await tx
      .select()
      .from(account)
      .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
      .limit(1);
    if (!existing2) throw new Error("Failed to resolve default cash account");
    return existing2.id;
  }

  if (!newAccId) {
    const [existing2] = await tx
      .select()
      .from(account)
      .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
      .limit(1);
    if (!existing2) throw new Error("Failed to resolve default cash account");
    return existing2.id;
  }

  return newAccId;
}

// -------------------------------------------------------------
// 1. إجراءات المشتريات (Purchases Actions)
// -------------------------------------------------------------

export async function createPurchase(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = purchaseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // التحقق من الـ Idempotency Key (§5.6)
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_purchase") {
            const [p] = await tx
              .select()
              .from(purchase)
              .where(and(eq(purchase.id, existingKey.targetId), isNull(purchase.deletedAt)));
            return { status: "ok", data: p };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      // SA1 (A-3 fix — Round 4) — منع التكرار المزدوج للأصل الرأسمالي: لا يمكن
      // تصنيف الشراء كأصل رأسمالي (isCapitalAsset=true) وربطه بصنف متتبَّع
      // (linkedCatalogComponentId != null) في نفس الوقت. هذا التركيب يُضاعف
      // قيمة الشراء في الميزانية: مرة في capitalAdditionsCents ومرّة في
      // inventoryValueCents، وكلاهما يُطرح من totalEquity (الأول) ويُضاف لـ
      // totalAssets (الثاني) — فتنكسر IC-1. الرفض داخل transaction → rollback
      // كامل، رسالة عربية واضحة.
      if (parsed.data.isCapitalAsset && parsed.data.linkedCatalogComponentId) {
        throw new Error(
          "لا يمكن تصنيف الشراء كأصل رأسمالي وربطه بصنف متتبَّع في نفس الوقت — هذا تكرار للمبلغ في الميزانية",
        );
      }

      // سعر الوحدة عالي الدقّة هو المصدر؛ نشتقّ الفردي الصحيح (fils) للعرض/التوافق.
      const derivedUnitCostCents = Math.round(
        parsed.data.unitCostMicroCents / 1000,
      );
      // Phase 3-revised (D4 fix) — إن كان الصنف المرتبط متتبَّعاً، نُضبط
      // is_tracked_inventory=true على صف الفاتورة. هذا يُعطِل computeOperatingPnl
      // عن طرح الشراء من operatingPurchasesCents (يُرأسمَل كمخزون بدلاً من ذلك).
      // نُحدِّد القيمة قبل INSERT بفحص الصنف المرتبط. إن لم يُربط الصنف أو كان
      // غير متتبَّع، القيمة الافتراضية false (مشتريات تشغيلية).
      let isTrackedInventory = false;
      if (parsed.data.linkedCatalogComponentId) {
        const [linkedComp0] = await tx
          .select({ id: catalogComponent.id, tracked: catalogComponent.tracked })
          .from(catalogComponent)
          .where(
            and(
              eq(catalogComponent.id, parsed.data.linkedCatalogComponentId),
              isNull(catalogComponent.deletedAt),
            ),
          )
          .for("update");
        if (!linkedComp0 || !linkedComp0.tracked) {
          // بطاقة 3.F: خطأ واضح لرفض الربط بصنف غير متتبَّع. transaction ترجع كاملة.
          throw new Error("الصنف غير متتبَّع أو غير موجود");
        }
        isTrackedInventory = true;
      }
      const [newPurchase] = await tx
        .insert(purchase)
        .values({
          date: parsed.data.date,
          item: parsed.data.item,
          supplier: parsed.data.supplier,
          quantity: parsed.data.quantity,
          unitCostMicroCents: parsed.data.unitCostMicroCents,
          unitCostCents: derivedUnitCostCents,
          notes: parsed.data.notes,
          // Phase 2 — التصنيف بُعدين. costNature → null للرأسمالي (لا معنى لطبيعته —
          // سيُهلك لاحقاً) وللقديم غير المُصنَّف. spec بطاقة 2.D القبول: رأسمالي
          // = (isCapitalAsset:true, costNature:null).
          isCapitalAsset: parsed.data.isCapitalAsset,
          costNature: parsed.data.isCapitalAsset
            ? null
            : (parsed.data.costNature ?? null),
          // Phase 3 — ربط اختياري بصنف الكتالوج (card 3.F). undefined → null للـ DB.
          linkedCatalogComponentId: parsed.data.linkedCatalogComponentId ?? null,
          // Phase 3-revised (D4 fix) — علم رأسمَلة المخزون (auto-set).
          isTrackedInventory,
        })
        .returning();

      if (!newPurchase) throw new Error("فشل إدخال المشتريات");

      // إدراج حركة الصندوق (التزاماً بـ §3) — فقط إن كان المبلغ موجباً (قيد DB:
      // cash_movement_amount_positive يتطلب amountCents > 0).
      // ملاحظة D4: النقد خرج فعلاً من الصندوق (cash DID leave the box)، لذا
      // نُدرِج الحركة دائماً. التمييز بين المشتريات التشغيلية والمُرأسمَلة كمخزون
      // يتم في computeOperatingPnl عبر is_tracked_inventory، لا بحذف الحركة هنا.
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      if (newPurchase.totalCents > 0) {
        await tx.insert(cashMovement).values({
          date: newPurchase.date,
          accountId: defaultAccountId,
          direction: "out",
          amountCents: newPurchase.totalCents,
          sourceType: "purchase",
          sourceId: newPurchase.id,
          description: newPurchase.notes || `شراء مواد: ${newPurchase.item} (الكمية: ${newPurchase.quantity})`,
        });
      }

      // Phase 3-revised (D4 fix) — إضافة حركة مخزون `in` إن كان الصنف متتبَّعاً.
      // unit_cost_cents = floor(totalCents / quantity) — تُخزَّن على الحركة لتُستعمَل
      // لاحقاً في حساب COGS عند البيع (تكلفة الوسط المرجَّح) ولقيمة المخزون في
      // الميزانية. Math.floor يقبل فقدان كسر الـ fils (موثَّق — Fils discipline).
      if (isTrackedInventory && parsed.data.linkedCatalogComponentId) {
        const unitCostCentsForMovement =
          newPurchase.quantity > 0
            ? Math.floor(newPurchase.totalCents / newPurchase.quantity)
            : 0;
        await addCatalogMovement({
          tx,
          catalogComponentId: parsed.data.linkedCatalogComponentId,
          direction: "in",
          quantity: parsed.data.quantity,
          sourceType: "purchase",
          sourceId: newPurchase.id,
          notes: `إضافة من فاتورة شراء: ${newPurchase.item} (الكمية: ${newPurchase.quantity})`,
          date: newPurchase.date,
          unitCostCents: unitCostCentsForMovement,
          // SA1 (A1 fix) — total_value_cents = totalCents (العدد الصحيح الأصلي)
          // لتفادي equityDrift عند الكميات غير القابلة للقسمة على totalCents.
          totalValueCents: newPurchase.totalCents,
          // requestId لا يُمرَّر: المفتاح مُستخدَم بالفعل من create_purchase.
          // convertOrderToSale يضمن idempotency على مستوى transaction كاملاً.
        });
      }

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_purchase",
          targetId: newPurchase.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newPurchase };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_purchase",
        entityType: "purchase",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updatePurchase(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = purchaseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchase)
        .where(eq(purchase.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل لمنع الكتابة الصامتة (§5.6)
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      // SA1 (A-3 fix — Round 4) — نفس فحص createPurchase: لا يمكن الجمع بين
      // isCapitalAsset=true و linkedCatalogComponentId != null. الرفض داخل
      // transaction → rollback.
      if (parsed.data.isCapitalAsset && parsed.data.linkedCatalogComponentId) {
        throw new Error(
          "لا يمكن تصنيف الشراء كأصل رأسمالي وربطه بصنف متتبَّع في نفس الوقت — هذا تكرار للمبلغ في الميزانية",
        );
      }

      const derivedUnitCostCents = Math.round(
        parsed.data.unitCostMicroCents / 1000,
      );
      // Phase 3-revised (D4 fix) — مثل createPurchase: اضبط is_tracked_inventory
      // تلقائياً بناءً على tracked للصنف المرتبط الجديد.
      let isTrackedInventory = false;
      if (parsed.data.linkedCatalogComponentId) {
        const [linkedComp0] = await tx
          .select({ id: catalogComponent.id, tracked: catalogComponent.tracked })
          .from(catalogComponent)
          .where(
            and(
              eq(catalogComponent.id, parsed.data.linkedCatalogComponentId),
              isNull(catalogComponent.deletedAt),
            ),
          )
          .for("update");
        if (!linkedComp0 || !linkedComp0.tracked) {
          throw new Error("الصنف غير متتبَّع أو غير موجود");
        }
        isTrackedInventory = true;
      }
      const [updatedPurchase] = await tx
        .update(purchase)
        .set({
          date: parsed.data.date,
          item: parsed.data.item,
          supplier: parsed.data.supplier,
          quantity: parsed.data.quantity,
          unitCostMicroCents: parsed.data.unitCostMicroCents,
          unitCostCents: derivedUnitCostCents,
          notes: parsed.data.notes,
          // Phase 2 — التصنيف بُعدين. costNature → null للرأسمالي (لا معنى لطبيعته —
          // سيُهلك لاحقاً) وللقديم غير المُصنَّف. spec بطاقة 2.D القبول: رأسمالي
          // = (isCapitalAsset:true, costNature:null).
          isCapitalAsset: parsed.data.isCapitalAsset,
          costNature: parsed.data.isCapitalAsset
            ? null
            : (parsed.data.costNature ?? null),
          // Phase 3 — ربط بصنف الكتالوج (card 3.F). undefined → null للـ DB.
          linkedCatalogComponentId: parsed.data.linkedCatalogComponentId ?? null,
          // Phase 3-revised (D4 fix) — علم رأسمَلة المخزون (auto-set).
          isTrackedInventory,
          updatedAt: new Date(),
        })
        .where(
          eq(purchase.id, id),
        )
        .returning();

      if (!updatedPurchase) {
        throw new Error("فشل تحديث المشتريات");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3) (P1-1)
      // V10: إن كان totalCents = 0 (بسبب تقريب micro-cents)، احذف الحركة ناعماً
      // بدل محاولة UPDATE بقيمة 0 (مرفوضة بقيد DB cash_movement_amount_positive).
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      if (updatedPurchase.totalCents > 0) {
        const [updatedMovement] = await tx
          .update(cashMovement)
          .set({
            amountCents: updatedPurchase.totalCents,
            date: updatedPurchase.date,
            accountId: defaultAccountId,
            description: updatedPurchase.notes || `شراء مواد: ${updatedPurchase.item} (الكمية: ${updatedPurchase.quantity})`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cashMovement.sourceType, "purchase"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt)
            )
          )
          .returning();

        if (!updatedMovement) {
          await tx.insert(cashMovement).values({
            date: updatedPurchase.date,
            accountId: defaultAccountId,
            direction: "out",
            amountCents: updatedPurchase.totalCents,
            sourceType: "purchase",
            sourceId: id,
            description: updatedPurchase.notes || `شراء مواد: ${updatedPurchase.item} (الكمية: ${updatedPurchase.quantity})`,
          });
        }
      } else {
        // totalCents = 0 → احذف الحركة النشطة إن وُجدت
        await tx
          .update(cashMovement)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(cashMovement.sourceType, "purchase"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt)
            )
          );
      }

      // Phase 3 — مزامنة حركة المخزون المرتبطة (card 3.F).
      // أبسط نهج (per spec): أعد الاشتقاق دائماً — احذف ناعماً أي حركة نشطة
      // مرتبطة بهذه الفاتورة، ثم أدرج جديدة إن كان الصنف الجديد مرتبطاً ومتتبَّعاً.
      // هذا أنظف من محاولة تحديث الكمية لأن التغيير قد يشمل الربط نفسه (صنف مختلف).
      await tx
        .update(catalogMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(catalogMovement.sourceType, "purchase"),
            eq(catalogMovement.sourceId, id),
            isNull(catalogMovement.deletedAt)
          )
        );

      if (isTrackedInventory && parsed.data.linkedCatalogComponentId) {
        const unitCostCentsForMovement =
          updatedPurchase.quantity > 0
            ? Math.floor(updatedPurchase.totalCents / updatedPurchase.quantity)
            : 0;
        await addCatalogMovement({
          tx,
          catalogComponentId: parsed.data.linkedCatalogComponentId,
          direction: "in",
          quantity: parsed.data.quantity,
          sourceType: "purchase",
          sourceId: updatedPurchase.id,
          notes: `إضافة من فاتورة شراء: ${updatedPurchase.item} (الكمية: ${updatedPurchase.quantity})`,
          date: updatedPurchase.date,
          unitCostCents: unitCostCentsForMovement,
          // SA1 (A1 fix) — total_value_cents = totalCents (العدد الصحيح الأصلي).
          totalValueCents: updatedPurchase.totalCents,
        });
      }

      // D7 fix — تحديث capital_asset المرتبط (إن وُجد نشط) ليُعكس المبلغ الجديد.
      // بدون هذا، تعديل المبلغ لا ينتشر لـ monthly_depreciation_cents (الفشل 2
      // من review D7). نحافظ على useful_life_months وstarted_at الأصليين.
      // monthly_dep = floor(newTotalCents / usefulLifeMonths) — نفس صيغة addCapitalAsset.
      const [existingCapAssetPurchase] = await tx
        .select({
          id: capitalAsset.id,
          usefulLifeMonths: capitalAsset.usefulLifeMonths,
        })
        .from(capitalAsset)
        .where(
          and(
            eq(capitalAsset.sourceType, "purchase"),
            eq(capitalAsset.sourceId, id),
            isNull(capitalAsset.deletedAt),
          ),
        )
        .limit(1);
      if (existingCapAssetPurchase) {
        const newMonthlyDep = Math.floor(
          updatedPurchase.totalCents / existingCapAssetPurchase.usefulLifeMonths,
        );
        await tx
          .update(capitalAsset)
          .set({
            purchaseAmountCents: updatedPurchase.totalCents,
            monthlyDepreciationCents: newMonthlyDep,
            updatedAt: new Date(),
          })
          .where(eq(capitalAsset.id, existingCapAssetPurchase.id));
      }

      revalidatePath("/finance");
      return { status: "ok", data: updatedPurchase };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "update_purchase",
        entityType: "purchase",
        entityId: id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deletePurchase(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchase)
        .where(eq(purchase.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      const [deleted] = await tx
        .update(purchase)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(purchase.id, id),
        )
        .returning();

      if (!deleted) {
        throw new Error("فشل حذف المشتريات");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "purchase"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      // Phase 3 — حذف ناعم لحركة المخزون المرتبطة (إن وُجدت) للحفاظ على اتساق
      // دفتر catalog_movement. حذف الفاتورة بدون هذا يترك حركة `in` يتيمة تُضخّم
      // الرصيد. الـ soft-delete يحافِظ على الأثر التاريخي.
      await tx
        .update(catalogMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(catalogMovement.sourceType, "purchase"),
            eq(catalogMovement.sourceId, id),
            isNull(catalogMovement.deletedAt)
          )
        );

      // D7 fix — حذف ناعم لأي capital_asset نشط مرتبط بهذه الفاتورة. بدون هذا،
      // الإهلاك يستمر بخصم الربح التشغيلي بعد حذف الفاتورة الأصلية. لا FK بين
      // الجدولين (تصميم مقصود) — التنظيف يتم هنا ضمن نفس الـ transaction.
      await tx
        .update(capitalAsset)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(capitalAsset.sourceType, "purchase"),
            eq(capitalAsset.sourceId, id),
            isNull(capitalAsset.deletedAt),
          ),
        );

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_purchase",
        entityType: "purchase",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 2. إجراءات المصاريف (Expenses Actions)
// -------------------------------------------------------------

export async function createExpense(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = expenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_expense") {
            const [e] = await tx
              .select()
              .from(expense)
              .where(and(eq(expense.id, existingKey.targetId), isNull(expense.deletedAt)));
            return { status: "ok", data: e };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const trimmedCategory = parsed.data.category.trim();
      await ensureExpenseCategoryInCatalog(trimmedCategory, tx);

      const [newExpense] = await tx
        .insert(expense)
        .values({
          date: parsed.data.date,
          category: trimmedCategory,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
          // Phase 2 — التصنيف بُعدين. costNature → null للرأسمالي (لا معنى لطبيعته —
          // سيُهلك لاحقاً) وللقديم غير المُصنَّف. spec بطاقة 2.D القبول: رأسمالي
          // = (isCapitalAsset:true, costNature:null).
          isCapitalAsset: parsed.data.isCapitalAsset,
          costNature: parsed.data.isCapitalAsset
            ? null
            : (parsed.data.costNature ?? null),
        })
        .returning();

      if (!newExpense) throw new Error("فشل إدخال المصاريف");

      // إدراج حركة الصندوق (التزاماً بـ §3) — فقط إن كان المبلغ موجباً (قيد DB:
      // cash_movement_amount_positive يتطلب amountCents > 0).
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      if (newExpense.amountCents > 0) {
        await tx.insert(cashMovement).values({
          date: newExpense.date,
          accountId: defaultAccountId,
          direction: "out",
          amountCents: newExpense.amountCents,
          sourceType: "expense",
          sourceId: newExpense.id,
          description: newExpense.description || `مصروف: ${trimmedCategory}`,
        });
      }

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_expense",
          targetId: newExpense.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newExpense };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_expense",
        entityType: "expense",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updateExpense(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = expenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expense)
        .where(eq(expense.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // SA-B (R5-3) — احرس صفوف هدر/تلف المخزون من التعديل. هذا المصروف ناتج
      // تلقائياً عن تسوية مخزون يدوية (adjustStock out ذو قيمة) ويُطابِق
      // total_value_cents لحركة catalog_movement. تعديل المبلغ يكسر المساواة
      // ويُحدث انحرافاً في IC-1 (نفس أثر الحذف). Throw داخل الـ transaction
      // قبل أي تحديث ليُلغى أي أثر جزئي. الصحيح: صحِّح المخزون من شاشة الكتالوج.
      if (existing.isInventoryWriteoff) {
        throw new Error(
          "هذا المصروف ناتج تلقائياً عن تسوية مخزون يدوية ولا يمكن تعديله أو حذفه من هنا — صحِّح المخزون من شاشة الكتالوج",
        );
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      const trimmedCategory = parsed.data.category.trim();
      await ensureExpenseCategoryInCatalog(trimmedCategory, tx);

      const [updatedExpense] = await tx
        .update(expense)
        .set({
          date: parsed.data.date,
          category: trimmedCategory,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
          // Phase 2 — التصنيف بُعدين. costNature → null للرأسمالي (لا معنى لطبيعته —
          // سيُهلك لاحقاً) وللقديم غير المُصنَّف. spec بطاقة 2.D القبول: رأسمالي
          // = (isCapitalAsset:true, costNature:null).
          isCapitalAsset: parsed.data.isCapitalAsset,
          costNature: parsed.data.isCapitalAsset
            ? null
            : (parsed.data.costNature ?? null),
          updatedAt: new Date(),
        })
        .where(
          eq(expense.id, id),
        )
        .returning();

      if (!updatedExpense) {
        throw new Error("فشل تحديث المصاريف");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3) (P1-1)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      const [updatedMovement] = await tx
        .update(cashMovement)
        .set({
          amountCents: updatedExpense.amountCents,
          date: updatedExpense.date,
          accountId: defaultAccountId,
          description: updatedExpense.description || `مصروف: ${updatedExpense.category}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "expense"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        )
        .returning();

      if (!updatedMovement && updatedExpense.amountCents > 0) {
        await tx.insert(cashMovement).values({
          date: updatedExpense.date,
          accountId: defaultAccountId,
          direction: "out",
          amountCents: updatedExpense.amountCents,
          sourceType: "expense",
          sourceId: id,
          description: updatedExpense.description || `مصروف: ${updatedExpense.category}`,
        });
      }

      // D7 fix — تحديث capital_asset المرتبط (إن وُجد نشط) ليُعكس المبلغ الجديد.
      // بدون هذا، تعديل المبلغ لا ينتشر لـ monthly_depreciation_cents (الفشل 2
      // من review D7). نحافظ على useful_life_months وstarted_at الأصليين.
      // monthly_dep = floor(newAmount / usefulLifeMonths) — نفس صيغة addCapitalAsset.
      const [existingCapAssetExpense] = await tx
        .select({
          id: capitalAsset.id,
          usefulLifeMonths: capitalAsset.usefulLifeMonths,
        })
        .from(capitalAsset)
        .where(
          and(
            eq(capitalAsset.sourceType, "expense"),
            eq(capitalAsset.sourceId, id),
            isNull(capitalAsset.deletedAt),
          ),
        )
        .limit(1);
      if (existingCapAssetExpense) {
        const newMonthlyDep = Math.floor(
          updatedExpense.amountCents / existingCapAssetExpense.usefulLifeMonths,
        );
        await tx
          .update(capitalAsset)
          .set({
            purchaseAmountCents: updatedExpense.amountCents,
            monthlyDepreciationCents: newMonthlyDep,
            updatedAt: new Date(),
          })
          .where(eq(capitalAsset.id, existingCapAssetExpense.id));
      }

      revalidatePath("/finance");
      return { status: "ok", data: updatedExpense };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "update_expense",
        entityType: "expense",
        entityId: id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deleteExpense(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expense)
        .where(eq(expense.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // SA-B (R5-3) — احرس صفوف هدر/تلف المخزون من الحذف. نفس المنطق المُطبَّق
      // في updateExpense أعلاه. الحذف الناعم لهذا الصف يُحدث انحرافاً في IC-1
      // بمقدار amount_cents (Round 3 defect يُعاد بنقرة واحدة). الصحيح: صحِّح
      // المخزون من شاشة الكتالوج.
      if (existing.isInventoryWriteoff) {
        throw new Error(
          "هذا المصروف ناتج تلقائياً عن تسوية مخزون يدوية ولا يمكن تعديله أو حذفه من هنا — صحِّح المخزون من شاشة الكتالوج",
        );
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      const [deleted] = await tx
        .update(expense)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(expense.id, id),
        )
        .returning();

      if (!deleted) {
        throw new Error("فشل حذف المصاريف");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "expense"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      // D7 fix — حذف ناعم لأي capital_asset نشط مرتبط بهذا المصروف. بدون هذا،
      // الإهلاك يستمر بخصم الربح التشغيلي بعد حذف المصروف الأصلي (الفشل 1 من
      // review D7). لا FK بين الجدولين (تصميم مقصود للحفاظ على السجل التاريخي)
      // لذا التنظيف يتم هنا ضمن نفس الـ transaction. الإهلاك المحسوب سابقاً يبقى
      // في P&L التاريخي — الحذف الناعم يوقف الإهلاك المستقبلي فقط (computeOperatingPnl
      // وgetCapitalAssetValuation كلاهما يفلتر deleted_at IS NULL).
      await tx
        .update(capitalAsset)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(capitalAsset.sourceType, "expense"),
            eq(capitalAsset.sourceId, id),
            isNull(capitalAsset.deletedAt),
          ),
        );

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_expense",
        entityType: "expense",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 3. إجراءات المبيعات (Sales Actions)
// -------------------------------------------------------------

export async function createSale(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = saleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_sale") {
            const [s] = await tx
              .select()
              .from(sale)
              .where(and(eq(sale.id, existingKey.targetId), isNull(sale.deletedAt)));
            return { status: "ok", data: s };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [newSale] = await tx
        .insert(sale)
        .values({
          date: parsed.data.date,
          source: parsed.data.source,
          orderId: parsed.data.orderId,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
        })
        .returning();

      if (!newSale) throw new Error("فشل إدخال المبيعات");

      // إدراج حركة الصندوق (التزاماً بـ §3) — D1/D2: للطلبات، نرحّل المتبقي فقط
      // لتفادي ازدواج عدّ العربون (سُجّل مسبقاً كمصدر 'deposit' عند إنشاء الطلب).
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      let amountToPost = newSale.amountCents;
      if (newSale.source === "order" && newSale.orderId) {
        const [ord] = await tx.select().from(order).where(eq(order.id, newSale.orderId));
        if (ord) {
          amountToPost = Math.max(0, newSale.amountCents - ord.depositCents);
        }
      }

      if (amountToPost > 0) {
        await tx.insert(cashMovement).values({
          date: newSale.date,
          accountId: defaultAccountId,
          direction: "in",
          amountCents: amountToPost,
          sourceType: "sale",
          sourceId: newSale.id,
          description: newSale.description || "مبيعات نقدية",
        });
      }

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_sale",
          targetId: newSale.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newSale };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_sale",
        entityType: "sale",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updateSale(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = saleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(sale)
        .where(eq(sale.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      const [updatedSale] = await tx
        .update(sale)
        .set({
          date: parsed.data.date,
          source: parsed.data.source,
          orderId: parsed.data.orderId,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
          updatedAt: new Date(),
        })
        .where(eq(sale.id, id))
        .returning();

      if (!updatedSale) {
        throw new Error("فشل تحديث المبيعات");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      let amountToPost = updatedSale.amountCents;
      if (updatedSale.source === "order" && updatedSale.orderId) {
        const [ord] = await tx.select().from(order).where(eq(order.id, updatedSale.orderId));
        if (ord) {
          amountToPost = Math.max(0, updatedSale.amountCents - ord.depositCents);
        }
      }

      const movWhere =
        updatedSale.source === "order" && updatedSale.orderId
          ? and(
              eq(cashMovement.sourceType, "sale"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt),
              sql`${cashMovement.description} NOT LIKE ${"%محوَّل من عربون%"}`,
            )
          : and(
              eq(cashMovement.sourceType, "sale"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt),
            );
      const [existingMov] = await tx.select().from(cashMovement).where(movWhere);

      if (amountToPost > 0) {
        if (existingMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: amountToPost,
              date: updatedSale.date,
              accountId: defaultAccountId,
              description: updatedSale.description || "مبيعات نقدية",
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: updatedSale.date,
            accountId: defaultAccountId,
            direction: "in",
            amountCents: amountToPost,
            sourceType: "sale",
            sourceId: updatedSale.id,
            description: updatedSale.description || "مبيعات نقدية",
          });
        }
      } else if (existingMov) {
        await tx
          .update(cashMovement)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(cashMovement.id, existingMov.id));
      }

      revalidatePath("/finance");
      return { status: "ok", data: updatedSale };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "update_sale",
        entityType: "sale",
        entityId: id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deleteSale(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(sale)
        .where(eq(sale.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      const [deleted] = await tx
        .update(sale)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sale.id, id))
        .returning();

      if (!deleted) {
        throw new Error("فشل حذف المبيعات");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "sale"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_sale",
        entityType: "sale",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 4. تحويل الطلب إلى مبيعات (Convert Order to Sale)
// -------------------------------------------------------------

export async function convertOrderToSale(
  orderId: string,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // 1. Idempotency check (serves retries first).
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "convert_to_sale") {
            const [s] = await tx
              .select()
              .from(sale)
              .where(and(eq(sale.orderId, orderId), isNull(sale.deletedAt)));
            return { status: "ok", data: s };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      // 2. Lock the order row to prevent concurrent modification.
      const [orderRow] = await tx
        .select()
        .from(order)
        .where(eq(order.id, orderId))
        .for("update");

      if (!orderRow) {
        return { status: "error", message: "الطلب غير موجود" };
      }
      if (orderRow.deletedAt) {
        return { status: "error", message: "لا يمكن تحويل طلب محذوف" };
      }
      if (orderRow.totalPriceCents <= 0) {
        return { status: "error", message: "لا يمكن تحويل طلب بسعر صفر إلى مبيعات. حدّد السعر أولاً." };
      }
      if (orderRow.status === "cancelled") {
        return { status: "error", message: "لا يمكن تحويل طلب ملغى. أنشئ طلباً جديداً بدلاً من ذلك." };
      }
      // F-32: نسمح بإعادة التحويل لطلب مُسلَّم لا يملك مبيعة نشطة (مثلاً بعد
      // deleteSale). التحقيق الفعلي يحدث في فحص existingSale أدناه.
      // Defensive re-validation: deposit must not exceed total realized revenue.
      // (Schema + action enforce this at create/update, but we re-check here as a backstop.)
      const realizedSaleCents =
        orderRow.totalPriceCents + (orderRow.additionalProfitCents ?? 0);
      if (orderRow.depositCents > realizedSaleCents) {
        return {
          status: "error",
          message: "العربون أكبر من إجمالي سعر الطلب والأرباح الإضافية. صحّح الطلب أولاً.",
        };
      }

      // 3. Check for existing non-deleted sale (prevent double conversion).
      const [existingSale] = await tx
        .select()
        .from(sale)
        .where(and(eq(sale.orderId, orderId), isNull(sale.deletedAt)));

      if (existingSale) {
        return {
          status: "error",
          message: "هذا الطلب تم تحويله إلى مبيعات مسبقاً ولا تزال المبيعة نشطة. احذف المبيعة أولاً إن أردت إعادة التحويل.",
        };
      }

      // 4. Record idempotency key.
      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "convert_to_sale",
          targetId: orderId,
        });
      }

      // 5. Insert the sale row. amountCents = FULL realized revenue
      //    (totalPrice + additionalProfit). additionalProfit is real earned income
      //    per the owner's clarification — it enters finance at the delivery moment.
      const saleDate = getAmmanDate();
      const [newSale] = await tx
        .insert(sale)
        .values({
          date: saleDate,
          source: "order",
          orderId: orderId,
          amountCents: realizedSaleCents,
          description: `مبيعات الطلب #${orderId.slice(0, 8)}`,
        })
        .returning();

      if (!newSale) {
        throw new Error("فشل تحويل الطلب إلى مبيعات");
      }

      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);

      // 6. TRANSFORM the existing active deposit cash_movement (if any) into a
      //    sale cash_movement. Reclassify sourceType 'deposit' -> 'sale' and
      //    rewrite sourceId from order.id to newSale.id. Amount/date/account/
      //    direction are UNCHANGED — this is a reclassification, not a new cash
      //    event. This is the core of the deposit-transform resolution.
      const [existingDepositMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.sourceType, "deposit"),
            eq(cashMovement.sourceId, orderId),
            isNull(cashMovement.deletedAt),
          ),
        );

      if (existingDepositMov) {
        await tx
          .update(cashMovement)
          .set({
            sourceType: "sale",
            sourceId: newSale.id,
            description: `مبيعات الطلب #${orderId.slice(0, 8)} (محوَّل من عربون)`,
            updatedAt: new Date(),
          })
          .where(eq(cashMovement.id, existingDepositMov.id));
      }

      // 7. Insert the REMAINDER sale cash_movement, if remainder > 0.
      //    remainder = realizedSaleCents - depositCents.
      //    After this step, sum of sale cash_movements for this sale =
      //    transformed_deposit_amount + remainder = realizedSaleCents.
      const remainderCents = realizedSaleCents - orderRow.depositCents;
      if (remainderCents > 0) {
        await tx.insert(cashMovement).values({
          date: saleDate,
          accountId: defaultAccountId,
          direction: "in",
          amountCents: remainderCents,
          sourceType: "sale",
          sourceId: newSale.id,
          description: `متبقي مبيعات الطلب #${orderId.slice(0, 8)}`,
        });
      }

      // 7.5. Phase 3 — خصم المخزون داخل نفس الـ transaction (card 3.D).
      //      إن فشل (مثلاً FK failure لصنف محذوف)، الـ transaction كله يرجع،
      //      بما فيه إدراج المبيعة وحركات الصندوق. هذا هو atomicity المطلوب.
      //      insertion point: قبل تحديث status (SA1 §3.D note) كي لا يصبح الطلب
      //      «مُسلَّم» فجأة وحركات المخزون فشلت. الأصناف غير المتتبَّعة تُتخطّى
      //      صامتةً (white-list). السالب لا يُمنع — يُسجَّل في notes (§6 سيناريو 1).
      await deductForDelivery({
        tx,
        orderId,
        saleId: newSale.id,
      });

      // 8. Update order status to delivered.
      await tx
        .update(order)
        .set({
          status: "delivered",
          updatedAt: new Date(),
        })
        .where(eq(order.id, orderId));

      revalidatePath("/finance");
      revalidatePath("/orders");
      return { status: "ok", data: newSale };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "convert_order_to_sale",
        entityType: "sale",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: { orderId },
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

/**
 * عكس تحويل الطلب إلى مبيعة — يُعيد الطلب من حالة "delivered" إلى "confirmed"
 * ويعكس كل الأثر المالي بطريقة نظيفة:
 *   1. يجد حركة العربون المحوَّلة (sourceType='sale', description LIKE '%محوَّل من عربون%')
 *      ويعيد تصنيفها إلى sourceType='deposit', sourceId=order.id (عكس التحويل).
 *   2. يحذف ناعماً حركة المتبقي (sourceType='sale', description NOT LIKE '%محوَّل من عربون%').
 *   3. يحذف ناعماً صف المبيعة.
 *   4. يُحدّث حالة الطلب إلى "confirmed".
 * هذا يسمح للمالك بالرجوع عن تسليم طلب لتعديل السعر/العربون/المنتج ثم إعادة التحويل.
 */
export async function reverseSale(
  orderId: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // 1. قفل صف الطلب
      const [orderRow] = await tx
        .select()
        .from(order)
        .where(eq(order.id, orderId))
        .for("update");

      if (!orderRow) {
        return { status: "error", message: "الطلب غير موجود" };
      }
      if (orderRow.deletedAt) {
        return { status: "error", message: "لا يمكن عكس طلب محذوف" };
      }
      if (orderRow.status !== "delivered") {
        return { status: "error", message: "لا يمكن عكس طلب غير مُسلَّم" };
      }

      // 2. ابحث عن المبيعة المرتبطة النشطة
      const [linkedSale] = await tx
        .select()
        .from(sale)
        .where(and(eq(sale.orderId, orderId), isNull(sale.deletedAt)));

      if (!linkedSale) {
        return { status: "error", message: "لا توجد مبيعة نشطة لهذا الطلب لعكسها" };
      }

      // 3. ابحث عن كل حركات sale النشطة المرتبطة بهذه المبيعة
      const saleMovs = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.sourceType, "sale"),
            eq(cashMovement.sourceId, linkedSale.id),
            eq(cashMovement.direction, "in"),
            isNull(cashMovement.deletedAt),
          ),
        );

      // 4. عكس كل حركة:
      //    - حركة "محوَّل من عربون" → أعِد تصنيفها إلى deposit, sourceId=order.id
      //    - حركة "المتبقي" → احذف ناعماً
      for (const mov of saleMovs) {
        const isTransformedDeposit = (mov.description ?? "").includes("محوَّل من عربون");
        if (isTransformedDeposit) {
          // أعِد تصنيف الحركة إلى deposit
          await tx
            .update(cashMovement)
            .set({
              sourceType: "deposit",
              sourceId: orderId,
              description: `عربون طلب - منتج: ${orderRow.productName}`,
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, mov.id));
        } else {
          // احذف ناعماً حركة المتبقي
          await tx
            .update(cashMovement)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(cashMovement.id, mov.id));
        }
      }

      // 4.5. Phase 3 — استرجاع حركات المخزون قبل حذف المبيعة (card 3.E).
      //      soft-delete كل catalog_movement بـ source_type='order_delivery'
      //      و source_id=linkedSale.id. يُستدعى داخل نفس الـ transaction، فأي
      //      فشل = rollback كامل. الترتيب: استرجاع المخزون أولاً، ثم حذف المبيعة.
      await restoreForReverse({ tx, saleId: linkedSale.id });

      // 5. احذف ناعماً صف المبيعة
      await tx
        .update(sale)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(sale.id, linkedSale.id));

      // 6. أعِد حالة الطلب إلى "confirmed"
      await tx
        .update(order)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(order.id, orderId));

      revalidatePath("/finance");
      revalidatePath("/orders");
      return { status: "ok", data: { orderId, reversed: true } };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "reverse_sale",
        entityType: "order",
        entityId: orderId,
        changesSnapshot: { reversed: true },
      });
    }
    return result;
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 5. أصناف المشتريات (Purchase Item Catalog Actions)
// -------------------------------------------------------------

export async function getPurchaseItemCatalog() {
  try {
    const items = await db
      .select()
      .from(purchaseItemCatalog)
      .where(isNull(purchaseItemCatalog.deletedAt))
      .orderBy(purchaseItemCatalog.name);
    return items;
  } catch (error) {
    console.error("Failed to fetch purchase item catalog:", error);
    return [];
  }
}

export async function createPurchaseItemCatalog(name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الصنف مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الصنف طويل جداً" };
  }

  try {
    const [inserted] = await db
      .insert(purchaseItemCatalog)
      .values({ name: name.trim() })
      .returning();

    revalidatePath("/finance");
    return { status: "ok", data: inserted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function updatePurchaseItemCatalog(id: string, name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الصنف مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الصنف طويل جداً" };
  }

  try {
    const [updated] = await db
      .update(purchaseItemCatalog)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(and(eq(purchaseItemCatalog.id, id), isNull(purchaseItemCatalog.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الصنف غير موجود أو تم حذفه" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deletePurchaseItemCatalog(id: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [deleted] = await db
      .update(purchaseItemCatalog)
      .set({ deletedAt: new Date() })
      .where(and(eq(purchaseItemCatalog.id, id), isNull(purchaseItemCatalog.deletedAt)))
      .returning();

    if (!deleted) {
      return { status: "error", message: "الصنف غير موجود أو تم حذفه مسبقاً" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: deleted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 6. فئات المصاريف (Expense Category Catalog Actions)
// -------------------------------------------------------------

export const DEFAULT_EXPENSE_CATEGORIES = [
  "رواتب",
  "إيجار",
  "كهرباء ومياه",
  "نقل وتوصيل",
  "تعبئة وتغليف",
  "صيانة وأدوات",
  "حوافز",
  "أخرى",
] as const;

export async function seedDefaultExpenseCategories(): Promise<{ seeded: number }> {
  try {
    // 1. جلب الفئات النشطة الحالية من الكتالوج
    const existing = await db
      .select({ name: expenseCategoryCatalog.name })
      .from(expenseCategoryCatalog)
      .where(isNull(expenseCategoryCatalog.deletedAt));

    const existingNormalized = new Set(
      existing.map((e) => e.name.trim().toLowerCase())
    );

    // 2. جلب الفئات المستعملة فعلياً في جدول المصاريف
    const usedExpenses = await db
      .selectDistinct({ category: expense.category })
      .from(expense)
      .where(and(isNull(expense.deletedAt), sql`trim(${expense.category}) != ''`));

    // 3. بناء قائمة الترشيحات: الفئات الافتراضية + فئات المصاريف القائمة
    const candidates = [
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...usedExpenses.map((u) => u.category),
    ];

    const toInsert: { name: string }[] = [];
    for (const cand of candidates) {
      if (!cand) continue;
      const trimmed = cand.trim();
      const norm = trimmed.toLowerCase();
      if (trimmed && trimmed.length <= 200 && !existingNormalized.has(norm)) {
        existingNormalized.add(norm);
        toInsert.push({ name: trimmed });
      }
    }

    if (toInsert.length > 0) {
      await db.insert(expenseCategoryCatalog).values(toInsert);
      return { seeded: toInsert.length };
    }

    return { seeded: 0 };
  } catch (error) {
    console.error("Failed to seed default expense categories:", error);
    return { seeded: 0 };
  }
}

export async function getExpenseCategoryCatalog() {
  try {
    let items = await db
      .select()
      .from(expenseCategoryCatalog)
      .where(isNull(expenseCategoryCatalog.deletedAt))
      .orderBy(expenseCategoryCatalog.name);

    // بذر كسول (Lazy Seeding) آمن عند فراغ الكتالوج
    if (items.length === 0) {
      const res = await seedDefaultExpenseCategories();
      if (res.seeded > 0) {
        items = await db
          .select()
          .from(expenseCategoryCatalog)
          .where(isNull(expenseCategoryCatalog.deletedAt))
          .orderBy(expenseCategoryCatalog.name);
      }
    }

    return items;
  } catch (error) {
    console.error("Failed to fetch expense category catalog:", error);
    return [];
  }
}

/**
 * يضمن وجود الفئة في كتالوج فئات المصاريف دون تكرار.
 * يُطبّع النص بحذف المسافات الطرفية trim() والمقارنة غير حساسة لحالة الأحرف والمسافات.
 * دفاعي بالكامل: لا يرمي أي خطأ إن فشل الإدراج لكي لا يعطّل حفظ المصروف.
 */
export async function ensureExpenseCategoryInCatalog(categoryName: string, tx?: any): Promise<void> {
  try {
    const trimmed = categoryName?.trim();
    if (!trimmed || trimmed.length === 0 || trimmed.length > 200) return;

    const dbClient = tx ?? db;

    // فحص وجود الفئة (مطابقة غير حساسة للأحرف والمسافات)
    const [existing] = await dbClient
      .select({ id: expenseCategoryCatalog.id })
      .from(expenseCategoryCatalog)
      .where(
        and(
          sql`lower(trim(${expenseCategoryCatalog.name})) = lower(trim(${trimmed}))`,
          isNull(expenseCategoryCatalog.deletedAt),
        ),
      )
      .limit(1);

    if (!existing) {
      await dbClient.insert(expenseCategoryCatalog).values({ name: trimmed });
    }
  } catch (error) {
    // دفاعي: لا نُفشل العملية الأصلية إن حدث خطأ في إضافة الفئة للكتالوج
    console.warn("Failed to ensure expense category in catalog:", error);
  }
}

export async function createExpenseCategoryCatalog(name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const trimmed = name?.trim();
  if (!trimmed || trimmed.length === 0) {
    return { status: "error", message: "اسم الفئة مطلوب" };
  }
  if (trimmed.length > 200) {
    return { status: "error", message: "اسم الفئة طويل جداً" };
  }

  try {
    // فحص عدم التكرار (مطابقة غير حساسة للأحرف والمسافات)
    const [existing] = await db
      .select({ id: expenseCategoryCatalog.id })
      .from(expenseCategoryCatalog)
      .where(
        and(
          sql`lower(trim(${expenseCategoryCatalog.name})) = lower(trim(${trimmed}))`,
          isNull(expenseCategoryCatalog.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return { status: "error", message: "هذه الفئة موجودة بالفعل" };
    }

    const [inserted] = await db
      .insert(expenseCategoryCatalog)
      .values({ name: trimmed })
      .returning();

    revalidatePath("/finance");
    return { status: "ok", data: inserted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function updateExpenseCategoryCatalog(id: string, name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const trimmed = name?.trim();
  if (!trimmed || trimmed.length === 0) {
    return { status: "error", message: "اسم الفئة مطلوب" };
  }
  if (trimmed.length > 200) {
    return { status: "error", message: "اسم الفئة طويل جداً" };
  }

  try {
    // فحص عدم التكرار مع فئة أخرى
    const [existing] = await db
      .select({ id: expenseCategoryCatalog.id })
      .from(expenseCategoryCatalog)
      .where(
        and(
          sql`lower(trim(${expenseCategoryCatalog.name})) = lower(trim(${trimmed}))`,
          ne(expenseCategoryCatalog.id, id),
          isNull(expenseCategoryCatalog.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      return { status: "error", message: "هذه الفئة موجودة بالفعل باسم آخر" };
    }

    const [updated] = await db
      .update(expenseCategoryCatalog)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(and(eq(expenseCategoryCatalog.id, id), isNull(expenseCategoryCatalog.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الفئة غير موجودة أو تم حذفها" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteExpenseCategoryCatalog(id: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [deleted] = await db
      .update(expenseCategoryCatalog)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenseCategoryCatalog.id, id), isNull(expenseCategoryCatalog.deletedAt)))
      .returning();

    if (!deleted) {
      return { status: "error", message: "الفئة غير موجودة أو تم حذفها مسبقاً" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: deleted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 6. إجراءات الحسابات المالية (Accounts Actions)
// -------------------------------------------------------------

export async function createAccount(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = accountInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      const [newAcc] = await tx
        .insert(account)
        .values({
          name: parsed.data.name,
          type: parsed.data.type,
        })
        .returning();

      if (!newAcc) throw new Error("فشل إنشاء الحساب");

      // Invariant: opening amounts live in cash_movement(sourceType='opening')
      if (parsed.data.openingSeedCents > 0) {
        // إدراج حركة الرصيد الافتتاحي
        await tx.insert(cashMovement).values({
          date: getAmmanDate(),
          accountId: newAcc.id,
          direction: "in",
          amountCents: parsed.data.openingSeedCents,
          sourceType: "opening",
          description: `رصيد افتتاحي لحساب: ${newAcc.name}`,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newAcc };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_account",
        entityType: "account",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function archiveAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    // D4: refuse to archive a non-zero-balance account (mirror deleteAccount)
    const [movIn] = await db
      .select({ total: sum(cashMovement.amountCents) })
      .from(cashMovement)
      .where(and(
        eq(cashMovement.accountId, id),
        eq(cashMovement.direction, "in"),
        isNull(cashMovement.deletedAt),
      ));
    const [movOut] = await db
      .select({ total: sum(cashMovement.amountCents) })
      .from(cashMovement)
      .where(and(
        eq(cashMovement.accountId, id),
        eq(cashMovement.direction, "out"),
        isNull(cashMovement.deletedAt),
      ));
    const balance = (Number(movIn?.total) || 0) - (Number(movOut?.total) || 0);
    if (balance !== 0) {
      return {
        status: "error",
        message: `لا يمكن أرشفة حساب برصيد غير صفري (${(balance / 1000).toFixed(3)} د.أ). حوّل الرصيد إلى حساب آخر أولاً.`,
      };
    }

    const [updated] = await db
      .update(account)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الحساب غير موجود" };
    }

    revalidatePath("/finance");
    // Issue #16 — audit log (defensive, never throws).
    await logAction({
      action: "archive_account",
      entityType: "account",
      entityId: id,
    });
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function unarchiveAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [updated] = await db
      .update(account)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الحساب غير موجود" };
    }

    revalidatePath("/finance");
    // Issue #16 — audit log (defensive, never throws).
    await logAction({
      action: "unarchive_account",
      entityType: "account",
      entityId: id,
    });
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // تحقق من عدم وجود حركات نشطة مرتبطة بالحساب (عدا الأرصدة الافتتاحية إن وجدت)
      const [movementsCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, id),
            isNull(cashMovement.deletedAt),
            ne(cashMovement.sourceType, "opening")
          )
        );

      if ((movementsCount?.count ?? 0) > 0) {
        return {
          status: "error",
          message: "لا يمكن حذف حساب به حركات مالية نشطة. استخدم الأرشفة بدلاً من ذلك.",
        };
      }

      // تحقق إضافي: لا يمكن حذف حساب يحمل رصيداً افتتاحياً نشطاً — حذفه يُسكِت
      // IC-11 (openingBalance row ≠ sum(active opening movements)).
      const [openingCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, id),
            eq(cashMovement.sourceType, "opening"),
            isNull(cashMovement.deletedAt),
          ),
        );
      if ((openingCount?.count ?? 0) > 0) {
        return {
          status: "error",
          message:
            "لا يمكن حذف حساب يحمل رصيداً افتتاحياً. عدّل الرصيد الافتتاحي أولاً أو انقله لحساب آخر.",
        };
      }

      // حذف حركات الرصيد الافتتاحي المرتبطة بالحساب soft delete
      await tx
        .update(cashMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cashMovement.accountId, id),
            eq(cashMovement.sourceType, "opening"),
            isNull(cashMovement.deletedAt)
          )
        );

      const [deleted] = await tx
        .update(account)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(account.id, id), isNull(account.deletedAt)))
        .returning();

      if (!deleted) {
        return { status: "error", message: "الحساب غير موجود" };
      }

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_account",
        entityType: "account",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getAccounts(): Promise<ActionResponse<Account[]>> {
  try {
    const items = await db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .orderBy(account.createdAt);
    return { status: "ok", data: items };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getAccountBalances(
  asOfDate?: string,
  includeArchived: boolean = false,
): Promise<ActionResponse<{ id: string; name: string; type: string; balanceCents: number; isArchived: boolean }[]>> {
  try {
    const accountConditions = [isNull(account.deletedAt)];
    if (!includeArchived) {
      accountConditions.push(eq(account.isArchived, false));
    }
    const accs = await db
      .select()
      .from(account)
      .where(and(...accountConditions))
      .orderBy(account.createdAt);

    const conditions = [
      isNull(cashMovement.deletedAt)
    ];

    if (asOfDate) {
      conditions.push(sql`${cashMovement.date} <= ${asOfDate}`);
    }

    const movements = await db
      .select({
        accountId: cashMovement.accountId,
        direction: cashMovement.direction,
        total: sum(cashMovement.amountCents),
      })
      .from(cashMovement)
      .where(and(...conditions))
      .groupBy(cashMovement.accountId, cashMovement.direction);

    const balanceMap: Record<string, { in: number; out: number }> = {};
    for (const m of movements) {
      if (!balanceMap[m.accountId]) {
        balanceMap[m.accountId] = { in: 0, out: 0 };
      }
      const val = Number(m.total) || 0;
      if (m.direction === "in") {
        balanceMap[m.accountId].in = val;
      } else if (m.direction === "out") {
        balanceMap[m.accountId].out = val;
      }
    }

    const result = accs.map((acc) => {
      const entry = balanceMap[acc.id] || { in: 0, out: 0 };
      const balanceCents = entry.in - entry.out;
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        balanceCents,
        isArchived: acc.isArchived,
      };
    });

    return { status: "ok", data: result };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function transferBetweenAccounts(
  fromId: string,
  toId: string,
  amountCents: number,
  date: string,
  description?: string,
  requestId?: string
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (fromId === toId) {
    return { status: "error", message: "لا يمكن التحويل إلى نفس الحساب" };
  }

  if (amountCents <= 0) {
    return { status: "error", message: "المبلغ يجب أن يكون أكبر من 0" };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "transfer") {
            return { status: "ok", data: { transferId: existingKey.targetId } };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [fromAcc] = await tx.select().from(account).where(eq(account.id, fromId));
      const [toAcc] = await tx.select().from(account).where(eq(account.id, toId));

      if (!fromAcc || !toAcc) {
        return { status: "error", message: "الحسابات غير موجودة" };
      }

      if (fromAcc.isArchived || toAcc.isArchived) {
        return { status: "error", message: "لا يمكن التحويل من أو إلى حساب مؤرشف" };
      }

      const transferId = crypto.randomUUID();

      // حركة خارجة من المرسل
      await tx.insert(cashMovement).values({
        date,
        accountId: fromId,
        direction: "out",
        amountCents,
        sourceType: "transfer",
        sourceId: transferId,
        description: description || `تحويل مالي إلى حساب: ${toAcc.name}`,
      });

      // حركة داخلة للمستقبل
      await tx.insert(cashMovement).values({
        date,
        accountId: toId,
        direction: "in",
        amountCents,
        sourceType: "transfer",
        sourceId: transferId,
        description: description || `تحويل مالي من حساب: ${fromAcc.name}`,
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "transfer",
          targetId: transferId,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: { transferId } };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_transfer",
        entityType: "transfer",
        entityId: (result.data as { transferId: string }).transferId,
        changesSnapshot: { fromId, toId, amountCents, date, description },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

/**
 * F-23: حذف تحويل مالي — يلغي كلا الحركتين (الخارجة والداخلة) المرتبطتين
 * بنفس transferId. يعكس التحويل تماماً (صافي الصفر على الميزانية محفوظ).
 */
export async function deleteTransfer(transferId: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // تحقق من وجود زوج التحويل النشط
      const movs = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.sourceType, "transfer"),
            eq(cashMovement.sourceId, transferId),
            isNull(cashMovement.deletedAt),
          ),
        );

      if (movs.length === 0) {
        return { status: "error", message: "التحويل غير موجود أو محذوف مسبقاً" };
      }

      // حذف ناعم لكلا الحركتين
      await tx
        .update(cashMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cashMovement.sourceType, "transfer"),
            eq(cashMovement.sourceId, transferId),
            isNull(cashMovement.deletedAt),
          ),
        );

      revalidatePath("/finance");
      return { status: "ok", data: { transferId, reversed: movs.length } };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_transfer",
        entityType: "transfer",
        entityId: (result.data as { transferId: string }).transferId,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 7. إجراءات سحوبات المالك (Owner Drawings Actions)
// -------------------------------------------------------------

export async function createOwnerTransaction(
  rawInput: unknown,
  requestId?: string
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = ownerTransactionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "owner_transaction") {
            const [ot] = await tx
              .select()
              .from(ownerTransaction)
              .where(and(eq(ownerTransaction.id, existingKey.targetId), isNull(ownerTransaction.deletedAt)));
            return { status: "ok", data: ot };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [acc] = await tx
        .select()
        .from(account)
        .where(eq(account.id, parsed.data.accountId))
        .limit(1);

      if (!acc) {
        return { status: "error", message: "الحساب المحدد غير موجود" };
      }

      if (acc.isArchived) {
        return { status: "error", message: "لا يمكن تنفيذ عمليات مالية على حساب مؤرشف" };
      }

      const [newTx] = await tx
        .insert(ownerTransaction)
        .values({
          date: parsed.data.date,
          type: parsed.data.type,
          amountCents: parsed.data.amountCents,
          accountId: parsed.data.accountId,
          reason: parsed.data.reason || "",
        })
        .returning();

      if (!newTx) throw new Error("فشل إدخال معاملة المالك");

      await tx.insert(cashMovement).values({
        date: parsed.data.date,
        accountId: parsed.data.accountId,
        direction: parsed.data.type === "draw" ? "out" : "in",
        amountCents: parsed.data.amountCents,
        sourceType: parsed.data.type === "draw" ? "owner_draw" : "owner_inject",
        sourceId: newTx.id,
        description: parsed.data.reason || (parsed.data.type === "draw" ? `سحوبات شخصية للمالك` : `حقن رأس مال شخصي من المالك`),
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "owner_transaction",
          targetId: newTx.id,
        });
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: newTx };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "create_owner_transaction",
        entityType: "owner_transaction",
        entityId: (result.data as { id: string }).id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getOwnerTransactions(filters?: { q?: string; type?: string }): Promise<ActionResponse<OwnerTransaction[]>> {
  try {
    const conditions = [isNull(ownerTransaction.deletedAt)];
    if (filters?.type && filters.type !== "all") {
      conditions.push(eq(ownerTransaction.type, filters.type));
    }
    if (filters?.q) {
      conditions.push(like(ownerTransaction.reason, `%${filters.q}%`));
    }
    const list = await db
      .select()
      .from(ownerTransaction)
      .where(and(...conditions))
      .orderBy(desc(ownerTransaction.date), desc(ownerTransaction.createdAt));
    return { status: "ok", data: list };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteOwnerTransaction(
  id: string,
  updatedAt?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const result: ActionResponse = await db.transaction(async (tx) => {
      // F-22: فحص التزامن المتفائل — اقرأ الصف أولاً وقارن updatedAt إن وُجد.
      const [existing] = await tx
        .select()
        .from(ownerTransaction)
        .where(and(eq(ownerTransaction.id, id), isNull(ownerTransaction.deletedAt)))
        .for("update");

      if (!existing) {
        return { status: "error", message: "المعاملة غير موجودة" };
      }

      if (updatedAt) {
        const clientTime = new Date(updatedAt).getTime();
        const dbTime = new Date(existing.updatedAt).getTime();
        if (clientTime !== dbTime) {
          return {
            status: "error",
            message: "تم تحديث البيانات من جهة أخرى",
          };
        }
      }

      const [deleted] = await tx
        .update(ownerTransaction)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(ownerTransaction.id, id), isNull(ownerTransaction.deletedAt)))
        .returning();

      if (!deleted) return { status: "error", message: "المعاملة غير موجودة" };

      // حذف حركة الصندوق المرتبطة
      await tx
        .update(cashMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            sql`${cashMovement.sourceType} in ('owner_draw', 'owner_inject')`,
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: deleted };
    });
    // Issue #16 — audit log (OUTSIDE transaction, defensive, never throws).
    if (result.status === "ok") {
      await logAction({
        action: "delete_owner_transaction",
        entityType: "owner_transaction",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 8. إجراءات الأرصدة الافتتاحية (Opening Balance Actions)
// -------------------------------------------------------------

export async function getOpeningBalance(): Promise<ActionResponse<OpeningBalance | null>> {
  try {
    const [row] = await db
      .select()
      .from(openingBalance)
      .where(isNull(openingBalance.deletedAt))
      .limit(1);
    return { status: "ok", data: row || null };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function saveOpeningBalance(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = openingBalanceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { goLiveDate, cashCents, bankCents, capitalCents } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [existingLocked] = await tx
        .select()
        .from(openingBalance)
        .where(and(eq(openingBalance.isLocked, true), isNull(openingBalance.deletedAt)))
        .limit(1);

      if (existingLocked) {
        return { status: "error", message: "الإعداد الافتتاحي مقفل ولا يمكن تعديله" };
      }

      // F-30: تحقق من أرشفة الحسابات الافتراضية BEFORE أي كتابة. لو أُرشفت،
      // نُرجع الخطأ مباشرةً حتى لا يلتزم db.transaction بإنشاء حساب جديد.
      const [existingCashAcc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
        .limit(1);
      const [existingBankAcc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.type, "bank"), eq(account.name, "حساب البنك الرئيسي"), isNull(account.deletedAt)))
        .limit(1);

      if (existingCashAcc?.isArchived || existingBankAcc?.isArchived) {
        return {
          status: "error",
          message: "لا يمكن تعديل الأرصدة الافتتاحية لأن حساب الصندوق أو البنك الرئيسي مؤرشف حالياً.",
        };
      }

      // البحث عن حساب الصندوق وحساب البنك الافتراضيين أو إنشاؤهما
      let [cashAcc] = existingCashAcc
        ? [existingCashAcc]
        : await tx
            .insert(account)
            .values({ name: "الصندوق الرئيسي", type: "cash" })
            .returning();
      if (existingCashAcc) {
        await tx
          .update(account)
          .set({ updatedAt: new Date() })
          .where(eq(account.id, cashAcc.id));
      }

      let [bankAcc] = existingBankAcc
        ? [existingBankAcc]
        : await tx
            .insert(account)
            .values({ name: "حساب البنك الرئيسي", type: "bank" })
            .returning();
      if (existingBankAcc) {
        await tx
          .update(account)
          .set({ updatedAt: new Date() })
          .where(eq(account.id, bankAcc.id));
      }

      // حفظ/تحديث سجل opening_balance
      const [existing] = await tx
        .select()
        .from(openingBalance)
        .where(isNull(openingBalance.deletedAt))
        .limit(1);

      let opRow;
      if (existing) {
        [opRow] = await tx
          .update(openingBalance)
          .set({
            goLiveDate,
            cashCents,
            bankCents,
            capitalCents,
            updatedAt: new Date(),
          })
          .where(eq(openingBalance.id, existing.id))
          .returning();
      } else {
        [opRow] = await tx
          .insert(openingBalance)
          .values({
            goLiveDate,
            cashCents,
            bankCents,
            capitalCents,
          })
          .returning();
      }

      // إضافة/تحديث حركات الصندوق للأرصدة الافتتاحية
      // حركة الصندوق
      const [existingCashMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, cashAcc.id),
            eq(cashMovement.sourceType, "opening")
          )
        );

      if (cashCents > 0) {
        if (existingCashMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: cashCents,
              date: goLiveDate,
              deletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingCashMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: goLiveDate,
            accountId: cashAcc.id,
            direction: "in",
            amountCents: cashCents,
            sourceType: "opening",
            description: "رصيد افتتاحي - الصندوق",
          });
        }
      } else {
        if (existingCashMov) {
          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingCashMov.id));
        }
      }

      // حركة البنك
      const [existingBankMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, bankAcc.id),
            eq(cashMovement.sourceType, "opening")
          )
        );

      if (bankCents > 0) {
        if (existingBankMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: bankCents,
              date: goLiveDate,
              deletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingBankMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: goLiveDate,
            accountId: bankAcc.id,
            direction: "in",
            amountCents: bankCents,
            sourceType: "opening",
            description: "رصيد افتتاحي - البنك",
          });
        }
      } else {
        if (existingBankMov) {
          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingBankMov.id));
        }
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: opRow };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function lockOpeningBalance(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [updated] = await db
      .update(openingBalance)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(and(eq(openingBalance.id, id), isNull(openingBalance.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "سجل الرصيد الافتتاحي غير موجود" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 9. إجراءات الذمم المدينة وسدادها (Receivables Actions)
// -------------------------------------------------------------

export async function createReceivable(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse<Receivable>> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = receivableInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse<Receivable> = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_receivable") {
            const [r] = await tx
              .select()
              .from(receivable)
              .where(and(eq(receivable.id, existingKey.targetId), isNull(receivable.deletedAt)));
            if (r) return { status: "ok", data: r };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      // التحقق من الحساب المالي
      const [acc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.id, parsed.data.accountId), isNull(account.deletedAt)));

      if (!acc) {
        return { status: "error", message: "الحساب المالي غير موجود أو محذوف" };
      }

      const [newRec] = await tx
        .insert(receivable)
        .values({
          date: parsed.data.date,
          personName: parsed.data.personName.trim(),
          amountCents: parsed.data.amountCents,
          accountId: parsed.data.accountId,
          notes: parsed.data.notes?.trim() || "",
        })
        .returning();

      if (!newRec) throw new Error("فشل تسجيل الذمة المدينة");

      // إدراج حركة الصندوق (خروج نقد دون مساس بالربح — ذمة مدينة)
      await tx.insert(cashMovement).values({
        date: newRec.date,
        accountId: newRec.accountId,
        direction: "out",
        amountCents: newRec.amountCents,
        sourceType: "receivable",
        sourceId: newRec.id,
        description: `دَين لشخص: ${newRec.personName}${newRec.notes ? ` — ${newRec.notes}` : ""}`,
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_receivable",
          targetId: newRec.id,
        });
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: newRec };
    });

    if (result.status === "ok") {
      await logAction({
        action: "create_receivable",
        entityType: "receivable",
        entityId: result.data.id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteReceivable(
  id: string,
  updatedAt?: string,
): Promise<ActionResponse<Receivable>> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse<Receivable> = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(receivable)
        .where(and(eq(receivable.id, id), isNull(receivable.deletedAt)))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود أو تم حذفه مسبقاً" };
      }

      if (updatedAt) {
        const clientTime = new Date(updatedAt).getTime();
        const dbTime = new Date(existing.updatedAt).getTime();
        if (clientTime !== dbTime) {
          return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
        }
      }

      const now = new Date();

      // حذف ناعم للدين
      const [deleted] = await tx
        .update(receivable)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(receivable.id, id))
        .returning();

      // جلب معرفات الدفعات المرتبطة لحذفها وحذف حركات الصندوق التابعة
      const payments = await tx
        .select({ id: receivablePayment.id })
        .from(receivablePayment)
        .where(and(eq(receivablePayment.receivableId, id), isNull(receivablePayment.deletedAt)));

      const paymentIds = payments.map((p) => p.id);

      // حذف ناعم للدفعات المرتبطة
      if (paymentIds.length > 0) {
        await tx
          .update(receivablePayment)
          .set({ deletedAt: now, updatedAt: now })
          .where(and(eq(receivablePayment.receivableId, id), isNull(receivablePayment.deletedAt)));
      }

      // حذف ناعم لحركة الصندوق الخاصة بالإقراض
      await tx
        .update(cashMovement)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(cashMovement.sourceType, "receivable"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt),
          ),
        );

      // حذف ناعم لحركات الصندوق الخاصة بالدفعات
      for (const pId of paymentIds) {
        await tx
          .update(cashMovement)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(cashMovement.sourceType, "receivable_payment"),
              eq(cashMovement.sourceId, pId),
              isNull(cashMovement.deletedAt),
            ),
          );
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: deleted };
    });

    if (result.status === "ok") {
      await logAction({
        action: "delete_receivable",
        entityType: "receivable",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function createReceivablePayment(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse<ReceivablePayment>> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = receivablePaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const result: ActionResponse<ReceivablePayment> = await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_receivable_payment") {
            const [p] = await tx
              .select()
              .from(receivablePayment)
              .where(and(eq(receivablePayment.id, existingKey.targetId), isNull(receivablePayment.deletedAt)));
            if (p) return { status: "ok", data: p };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      // جلب الدين الأصلي والتحقق من وجوده
      const [rec] = await tx
        .select()
        .from(receivable)
        .where(and(eq(receivable.id, parsed.data.receivableId), isNull(receivable.deletedAt)))
        .for("update");

      if (!rec) {
        return { status: "error", message: "سجل الدَّين غير موجود أو تم حذفه" };
      }

      // التحقق من الحساب المالي
      const [acc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.id, parsed.data.accountId), isNull(account.deletedAt)));

      if (!acc) {
        return { status: "error", message: "الحساب المالي المستلم غير موجود أو محذوف" };
      }

      // حساب المتبقي من الدين
      const [paidSum] = await tx
        .select({ total: sum(receivablePayment.amountCents) })
        .from(receivablePayment)
        .where(
          and(
            eq(receivablePayment.receivableId, rec.id),
            isNull(receivablePayment.deletedAt),
          ),
        );

      const existingPaidCents = Number(paidSum?.total) || 0;
      const remainingCents = Math.max(0, rec.amountCents - existingPaidCents);

      if (remainingCents <= 0) {
        return { status: "error", message: "هذا الدَّين مسدَّد بالكامل بالفعل" };
      }

      if (parsed.data.amountCents > remainingCents) {
        return {
          status: "error",
          message: `مبلغ الدفعة (${(parsed.data.amountCents / 1000).toFixed(3)} د.أ) يتجاوز المبلغ المتبقي (${(remainingCents / 1000).toFixed(3)} د.أ)`,
        };
      }

      const [newPayment] = await tx
        .insert(receivablePayment)
        .values({
          receivableId: rec.id,
          date: parsed.data.date,
          amountCents: parsed.data.amountCents,
          accountId: parsed.data.accountId,
          notes: parsed.data.notes?.trim() || "",
        })
        .returning();

      if (!newPayment) throw new Error("فشل تسجيل دفعة السداد");

      // إدراج حركة الصندوق (دخول نقد كاسترداد دين دون مساس بالربح)
      await tx.insert(cashMovement).values({
        date: newPayment.date,
        accountId: newPayment.accountId,
        direction: "in",
        amountCents: newPayment.amountCents,
        sourceType: "receivable_payment",
        sourceId: newPayment.id,
        description: `سداد دفعة دين: ${rec.personName}${newPayment.notes ? ` — ${newPayment.notes}` : ""}`,
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_receivable_payment",
          targetId: newPayment.id,
        });
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: newPayment };
    });

    if (result.status === "ok") {
      await logAction({
        action: "create_receivable_payment",
        entityType: "receivable_payment",
        entityId: result.data.id,
        changesSnapshot: parsed.data,
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteReceivablePayment(
  id: string,
  updatedAt?: string,
): Promise<ActionResponse<ReceivablePayment>> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    const result: ActionResponse<ReceivablePayment> = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(receivablePayment)
        .where(and(eq(receivablePayment.id, id), isNull(receivablePayment.deletedAt)))
        .for("update");

      if (!existing) {
        return { status: "error", message: "دفعة السداد غير موجودة أو تم حذفها" };
      }

      if (updatedAt) {
        const clientTime = new Date(updatedAt).getTime();
        const dbTime = new Date(existing.updatedAt).getTime();
        if (clientTime !== dbTime) {
          return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
        }
      }

      const now = new Date();

      const [deleted] = await tx
        .update(receivablePayment)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(receivablePayment.id, id))
        .returning();

      // حذف حركة الصندوق التابعة للدفعة
      await tx
        .update(cashMovement)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(cashMovement.sourceType, "receivable_payment"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt),
          ),
        );

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: deleted };
    });

    if (result.status === "ok") {
      await logAction({
        action: "delete_receivable_payment",
        entityType: "receivable_payment",
        entityId: id,
        changesSnapshot: { deleted: true },
      });
    }
    return result;
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 10. فحص السلامة المالية (Financial Integrity Check)
// -------------------------------------------------------------

export async function runFinancialIntegrityCheckAction(
  asOfDate?: string,
): Promise<ActionResponse<IntegrityReport>> {
  try {
    const report = await runFinancialIntegrityCheck(asOfDate);
    return { status: "ok", data: report };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

