"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { capitalAsset } from "./db";

// ─────────────────────────────────────────────────────────────────────────
// depreciation/queries — دوال قراءة الإهلاك (محسوبة عند العرض، خيار γ)
// ─────────────────────────────────────────────────────────────────────────
// لا توجد حركة شهرية مخزَّنة (لا CRON ولا جدول شهري). كل قيمة إهلاك تُحسَب عند
// القراءة من capital_asset عبر EXTRACT-based months_elapsed (انظر NOTE-4 أدناه).
//
// دوال القراءة هنا تُستخدَم من:
//   - computeOperatingPnl (src/features/finance/pnl.ts): لحساب monthlyDepreciationCents
//     للفترة الحالية (شهر واحد لكل أصل تحت الإهلاك).
//   - IC-14 (src/features/finance/integrityCheck.ts): لحساب netBookValue لكل الأصول.
//
// ⚠️ CRITICAL-NOTE-4 (SA1): مواصفات البطاقة 4.D تقترح:
//      date_part('month', age(asOfDate, started_at::date)) < useful_life_months
//    هذا خاطئ — date_part('month', age(...)) يُرجِع مكوّن الشهر فقط من الفترة
//    (0-11)، لا إجمالي الأشهر. لأصل عمره 14 شهراً يُرجِع 2، فيستمر الإهلاك
//    خطأً بعد انقضاء العمر النافع.
//
//    الحل (المُتَّبع هنا): EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age)
//    يُرجِع إجمالي الأشهر المنقضية فعلاً (14 = 1×12 + 2). يُستخدَم في كل من
//    computeOperatingPnl و IC-14.
// ─────────────────────────────────────────────────────────────────────────

// نوع المعاملة Drizzle. نستخدم any لأن نوع tx المُمرَّر من db.transaction هو
// PgTransaction الداخلي والذي يصعب التعبير عنه بدون generics.
// biome-ignore lint/suspicious/noExplicitAny: drizzle tx type is complex
type Tx = any;

/**
 * حساب إجمالي الإهلاك الشهري الجاري للأصول النشطة حتى asOfDate.
 *
 * لكل صف capital_asset نشط (deleted_at IS NULL) بدأ الإهلاك (started_at::date <= asOfDate)
 * ولم يكتمل بعد (months_elapsed < useful_life_months): يُضاف monthly_depreciation_cents.
 *
 * النتيجة = SUM(monthly_depreciation_cents) — أي قيمة الإهلاك للشهر الحالي.
 * تُخصَم من operatingNetCents في computeOperatingPnl.
 *
 * ملاحظة: هذا ليس "إجمالي الإهلاك التراكمي" — إنما حصّة الشهر الواحد لكل أصل
 * تحت الإهلاك. التراكمي يُحسَب في IC-14 (months_elapsed × monthly_dep لكل أصل).
 *
 * ⚠️ EXTRACT بدل date_part (CRITICAL-NOTE-4): راجع التعليق أعلى الملف.
 */
export async function getActiveMonthlyDepreciationCents(
  asOfDate: string,
  tx: Tx = db,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(${capitalAsset.monthlyDepreciationCents}), 0)::bigint`,
    })
    .from(capitalAsset)
    .where(
      and(
        isNull(capitalAsset.deletedAt),
        sql`${capitalAsset.startedAt}::date <= ${asOfDate}`,
        // ⚠️ CRITICAL-NOTE-4 (SA1): EXTRACT-based months_elapsed بدل date_part.
        // date_part('month', age(...)) يُرجِع 0-11 فقط (مكوّن الشهر)، أما
        // (EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age)) فيُرجِع
        // إجمالي الأشهر المنقضية. لأصل عمره 18 شهراً: date_part = 6 (خطأ)،
        // EXTRACT = 18 (صحيح). انظر SA1 validation-report §CRITICAL-NOTE-4.
        sql`(
          EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
          + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
        ) < ${capitalAsset.usefulLifeMonths}`,
      ),
    );

  return Number(row?.total) || 0;
}

/**
 * حساب إجمالي قيمة الأصول والمُهلَك حتى asOfDate (لـ IC-14).
 *
 * يُرجِع:
 *   - totalOriginalCents: SUM(purchase_amount_cents) WHERE deleted_at IS NULL.
 *   - totalDepreciatedToDateCents: SUM(months_elapsed × monthly_dep) لكل أصل
 *     حيث months_elapsed <= useful_life_months (الأصول المُستهلَكة بالكامل
 *     تُساهم بـ useful_life_months × monthly_dep = purchase_amount تقريباً،
 *     قد يقل بفعل Math.floor في monthly_dep).
 *   - netBookValueCents: totalOriginalCents - totalDepreciatedToDateCents.
 *
 * months_elapsed يُحسَب بالصيغة الصحيحة (EXTRACT، راجع NOTE-4 أعلاه).
 * الأصول التي started_at > asOfDate (لم تبدأ بعد) تُساهم بـ 0 في totalDepreciated.
 *
 * الأصول المحذوفة ناعماً (deleted_at IS NOT NULL) مستثناة بالكامل.
 */
export async function getCapitalAssetValuation(asOfDate: string, tx: Tx = db): Promise<{
  totalOriginalCents: number;
  totalDepreciatedToDateCents: number;
  netBookValueCents: number;
  activeCount: number;
}> {
  const [row] = await tx
    .select({
      totalOriginal: sql<number>`coalesce(sum(${capitalAsset.purchaseAmountCents}), 0)::bigint`,
      totalDepreciated: sql<number>`coalesce(sum(
        case
          when ${capitalAsset.startedAt}::date > ${asOfDate}::date then 0
          when (
            EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) >= ${capitalAsset.usefulLifeMonths}
            then ${capitalAsset.usefulLifeMonths} * ${capitalAsset.monthlyDepreciationCents}
          else (
            EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) * ${capitalAsset.monthlyDepreciationCents}
        end
      ), 0)::bigint`,
      activeCount: sql<number>`count(*)::bigint`,
    })
    .from(capitalAsset)
    .where(isNull(capitalAsset.deletedAt));

  const totalOriginalCents = Number(row?.totalOriginal) || 0;
  const totalDepreciatedToDateCents = Number(row?.totalDepreciated) || 0;
  const netBookValueCents = totalOriginalCents - totalDepreciatedToDateCents;
  const activeCount = Number(row?.activeCount) || 0;

  return {
    totalOriginalCents,
    totalDepreciatedToDateCents,
    netBookValueCents,
    activeCount,
  };
}

/**
 * التحقق من وجود capital_asset نشط مرتبط بصف expense/purchase محدَّد.
 * يُستخدَم في ExpenseForm/PurchaseForm لتحديد ما إذا كان الإهلاك قد أُنشئ
 * مسبقاً لهذا الصف (لإظهار/إخفاء زر «تعديل الإهلاك» مستقبلاً).
 */
export async function getCapitalAssetForSource(
  sourceType: "expense" | "purchase",
  sourceId: string,
  tx: Tx = db,
): Promise<CapitalAssetRow | null> {
  const [row] = await tx
    .select()
    .from(capitalAsset)
    .where(
      and(
        eq(capitalAsset.sourceType, sourceType),
        eq(capitalAsset.sourceId, sourceId),
        isNull(capitalAsset.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

type CapitalAssetRow = typeof capitalAsset.$inferSelect;
