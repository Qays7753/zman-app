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
//     (= إهلاك الفترة [startDate, endDate] — period-aware بعد إصلاح D2). لكل أصل
//     تحت الإهلاك، يُحتسى الفرق بين months_elapsed عند endDate وعند startDate.
//   - IC-14 (src/features/finance/integrityCheck.ts): لحساب netBookValue لكل الأصول
//     (تراكمي حتى asOfDate — ليس period-aware).
//
// ⚠️ CRITICAL-NOTE-4 (SA1): مواصفات البطاقة 4.D تقترح:
//      date_part('month', age(asOfDate, started_at::date)) < useful_life_months
//    هذا خاطئ — date_part('month', age(...)) يُرجِع مكوّن الشهر فقط من الفترة
//    (0-11)، لا إجمالي الأشهر. لأصل عمره 14 شهراً يُرجِع 2، فيستمر الإهلاك
//    خطأً بعد انقضاء العمر النافع.
//
//    الحل (المُتَّبع هنا): EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age)
//    يُرجِع إجمالي الأشهر المنقضية فعلاً (14 = 1×12 + 2). يُستخدَم في كل من
//    computeOperatingPnl و IC-14. لا تغيير على هذه الصيغة (CRITICAL-NOTE-4).
//
// ⚠️ D2 fix (SA2): getDepreciationForPeriodCents تقبل { startDate, endDate }
//    وتُعيد إهلاك الفترة، لا حصّة شهر واحد. الصيغة:
//      (min(monthsElapsedAt(endDate), usefulLife)
//       − min(monthsElapsedAt(effectiveStart), usefulLife)) × monthly_dep
//    حيث effectiveStart = max(startedAt, startDate). إن startDate = null
//    (range:"all") → monthsAtStart = 0 لكل أصل → النتيجة تراكمية حتى endDate.
// ─────────────────────────────────────────────────────────────────────────

// نوع المعاملة Drizzle. نستخدم any لأن نوع tx المُمرَّر من db.transaction هو
// PgTransaction الداخلي والذي يصعب التعبير عنه بدون generics.
// biome-ignore lint/suspicious/noExplicitAny: drizzle tx type is complex
type Tx = any;

/**
 * حساب الإهلاك المُتراكِم خلال الفترة [startDate, endDate] (D2 fix).
 *
 * لكل صف capital_asset نشط (deleted_at IS NULL) يُحتسى:
 *
 *   depreciationForWindow =
 *     ( min(monthsElapsedAt(endDate),        usefulLifeMonths)
 *       − min(monthsElapsedAt(effectiveStart), usefulLifeMonths) )
 *     × monthly_depreciation_cents
 *
 * حيث:
 *   - effectiveStart = max(started_at, startDate). الأصل لا يُحتسى قبل بدئه.
 *   - إن startDate = null (range:"all" أو getFinancialPosition) → effectiveStart
 *     يُعامَل كأنه startedAt نفسه → monthsAtStart = 0 لكل أصل → النتيجة
 *     تراكمية حتى endDate (هذا ما يحتاجه P&L لكامل الفترة).
 *   - إن started_at > endDate → الأصل لم يبدأ بعد → 0 (CASE الأول).
 *   - إن monthsElapsedAt(startDate) ≥ usefulLifeMonths → الأصل مُستهلَك بالكامل
 *     قبل بداية الفترة → 0 (CASE الثاني، يمنع الإهلاك المكرَّر بعد انقضاء العمر).
 *
 * months_elapsed يُحسَب بصيغة EXTRACT الصحيحة (CRITICAL-NOTE-4 — لا تغيير):
 *   (EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age))
 *
 * النتيجة تُخصَم من operatingNetCents في computeOperatingPnl. مع هذا التعديل
 * يصبح الإهلاك period-aware:
 *   - فترة شهر واحد → شهر واحد من الإهلاك لكل أصل نشط بدأ قبل بداية الفترة.
 *   - فترة سنة → 12 شهراً (أو أقل إن انقضى العمر النافع).
 *   - range:"all" → cumulative-to-date.
 *
 * هذا يُصلِح D2 حيث كان computeCashBasisPnl("all") يطرح شهراً واحداً فقط من
 * إهلاك كامل العمر لأن الدالة القديمة getActiveMonthlyDepreciationCents كانت
 * تُعيد SUM(monthly_dep) ثابتة لكل الأصول النشطة بغضّ النظر عن طول الفترة.
 *
 * مثال (انظر ACCOUNTING_RULES.md §10): أصل 1,200,000 فلس على 12 شهراً بدأ
 * قبل 10 أشهر → monthly_dep = 100,000. range:"all" → 10 × 100,000 = 1,000,000.
 * نافذة 30 يوماً → 1 × 100,000 = 100,000. نافذة شهرين → 200,000.
 */
export async function getDepreciationForPeriodCents(
  { startDate, endDate }: { startDate: string | null; endDate: string },
  tx: Tx = db,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`
        coalesce(sum(
          case
            -- الأصل لم يبدأ بعد endDate → لا إهلاك
            when ${capitalAsset.startedAt}::date > ${endDate}::date then 0
            -- الأصل مُستهلَك بالكامل قبل بداية الفترة → لا إهلاك مكرَّر
            when ${startDate}::date is not null
              and ${capitalAsset.startedAt}::date <= ${startDate}::date
              and (
                extract(year from age(${startDate}::date, ${capitalAsset.startedAt}::date)) * 12
                + extract(month from age(${startDate}::date, ${capitalAsset.startedAt}::date))
              ) >= ${capitalAsset.usefulLifeMonths}
              then 0
            else (
              least(
                extract(year from age(${endDate}::date, ${capitalAsset.startedAt}::date)) * 12
                + extract(month from age(${endDate}::date, ${capitalAsset.startedAt}::date)),
                ${capitalAsset.usefulLifeMonths}::numeric
              )
              - least(
                case
                  when ${startDate}::date is null then 0
                  when ${capitalAsset.startedAt}::date > ${startDate}::date then 0
                  else
                    extract(year from age(${startDate}::date, ${capitalAsset.startedAt}::date)) * 12
                    + extract(month from age(${startDate}::date, ${capitalAsset.startedAt}::date))
                end,
                ${capitalAsset.usefulLifeMonths}::numeric
              )
            ) * ${capitalAsset.monthlyDepreciationCents}
          end
        ), 0)::bigint
      `,
    })
    .from(capitalAsset)
    .where(isNull(capitalAsset.deletedAt));

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
