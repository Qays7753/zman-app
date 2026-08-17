"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { capitalAsset } from "./db";
// D7 fix — expense وpurchase لكشف الأصول اليتيمة في getCapitalAssetValuation.
// capital_asset لا يملك FK إلى expense/purchase (تصميم مقصود — راجع db.ts)،
// لكن IC-14 يفحص وجود المصدر عبر LEFT JOIN ويُعدّ الأصول اليتيمة (FAIL).
import { expense, purchase } from "../finance/db";

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
 *   - totalOriginalCents: SUM(purchase_amount_cents) WHERE deleted_at IS NULL
 *     — مُقيَّد بالأصول التي بدأت (started_at::date <= asOfDate::date) فقط.
 *     الأصول ذات started_at مستقبلي لا تُحتسَب في activeCount ولا في الإهلاك.
 *   - totalDepreciatedToDateCents: SUM(depreciationForAsset) لكل أصل حيث
 *     depreciationForAsset =
 *       إن months_elapsed >= useful_life_months → purchase_amount_cents
 *       (الشهر الأخير يُكلِّف الباقي ليصل الأصل لصفر بدل ترك residual صغير
 *       من floor؛ D13 fix).
 *       وإلا → months_elapsed × monthly_dep.
 *   - netBookValueCents: totalOriginalCents - totalDepreciatedToDateCents
 *     (يصل لـ 0 بالضبط عند انقضاء العمر النافع، بفضل قاعدة الشهر الأخير).
 *   - activeCount: عدد الأصول التي تُستهلِك فعلاً الآن
 *     (started_at <= asOfDate AND months_elapsed < useful_life_months).
 *   - fullyDepreciatedCount: عدد الأصول المُستهلَكة بالكامل
 *     (started_at <= asOfDate AND months_elapsed >= useful_life_months). تُساهم
 *     بـ purchase_amount_cents في totalDepreciated (لا residual).
 *   - pendingCount: عدد الأصول مستقبلية البدء (started_at > asOfDate) — نادرة
 *     لكن ممكنة إذا عدّل المستخدم التاريخ. لا تُساهم في الإهلاك ولا في active.
 *
 * months_elapsed يُحسَب بصيغة EXTRACT الصحيحة (CRITICAL-NOTE-4 — لا تغيير).
 * الأصول المحذوفة ناعماً (deleted_at IS NOT NULL) مستثناة بالكامل.
 *
 * D13 fix — activeCount مُقيَّد الآن بالأصول التي تُستهلِك فعلاً (بدلاً من
 * `count(*)` على كل صف غير محذوف، الذي كان يشمل future-started وfully-depreciated).
 * D13 fix — قاعدة «الشهر الأخير يُكلِّف الباقي» تضمن netBookValueCents = 0 عند
 * انقضاء العمر النافع، بدل ترك residual صغير من floor(amount/life) للأبد.
 */
export async function getCapitalAssetValuation(asOfDate: string, tx: Tx = db): Promise<{
  totalOriginalCents: number;
  totalDepreciatedToDateCents: number;
  netBookValueCents: number;
  activeCount: number;
  fullyDepreciatedCount: number;
  pendingCount: number;
  orphanCount: number;
}> {
  // D7 fix — كشف الأصول اليتيمة: capital_asset نشط لكن مصدره (expense أو purchase)
  // غير موجود أو محذوف ناعماً. مع وجود منطق التنظيف في deleteExpense/deletePurchase
  // (يحذف ناعماً capital_asset المرتبط)، يجب أن يكون orphanCount دائماً 0 — لكن
  // الفحص هو شبكة الأمان. نستعمل LEFT JOIN ونعدّ الصفوف حيث source.id IS NULL.
  // expense.id وpurchase.id كلاهما uuid NOT NULL، فـ IS NULL يعني «لا صف مطابق»
  // (إما محذوف ناعماً بـ deletedAt IS NOT NULL، أو غير موجود أصلاً).
  // ملاحظة: نُفرِق هذا الاستعلام عن استعلام IC-14 نفسه — هذا aggregation على
  // capital_asset، و IC-14 يستعمله. الفصل يبقي IC-14 بسيطاً.
  const [row] = await tx
    .select({
      totalOriginal: sql<number>`coalesce(sum(
        case when ${capitalAsset.startedAt}::date <= ${asOfDate}::date
             then ${capitalAsset.purchaseAmountCents}
             else 0 end
      ), 0)::bigint`,
      totalDepreciated: sql<number>`coalesce(sum(
        case
          -- الأصل لم يبدأ بعد asOfDate → 0
          when ${capitalAsset.startedAt}::date > ${asOfDate}::date then 0
          -- الأصل مُستهلَك بالكامل (months_elapsed >= useful_life): نُكلِّف كامل
          -- purchase_amount ليصل netBookValue إلى صفر. D13 fix: قاعدة «الشهر
          -- الأخير يُكلِّف الباقي». الصيغة الجبرية: مجموع الإهلاك عبر عمر الأصل
          -- = (life−1) × monthly_dep + (amount − (life−1) × monthly_dep) = amount.
          -- فبدل أن نترك residual صغير من floor(amount/life) للأبد في netBookValue،
          -- نضمن أن الصفر المُطلق يُحقَّق عند انقضاء العمر النافع.
          when (
            EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) >= ${capitalAsset.usefulLifeMonths}
            then ${capitalAsset.purchaseAmountCents}
          else (
            EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) * ${capitalAsset.monthlyDepreciationCents}
        end
      ), 0)::bigint`,
      activeCount: sql<number>`coalesce(sum(
        case when ${capitalAsset.startedAt}::date <= ${asOfDate}::date
              and (
                EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
                + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
              ) < ${capitalAsset.usefulLifeMonths}
             then 1 else 0 end
      ), 0)::bigint`,
      fullyDepreciatedCount: sql<number>`coalesce(sum(
        case when ${capitalAsset.startedAt}::date <= ${asOfDate}::date
              and (
                EXTRACT(YEAR FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
                + EXTRACT(MONTH FROM age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
              ) >= ${capitalAsset.usefulLifeMonths}
             then 1 else 0 end
      ), 0)::bigint`,
      pendingCount: sql<number>`coalesce(sum(
        case when ${capitalAsset.startedAt}::date > ${asOfDate}::date
             then 1 else 0 end
      ), 0)::bigint`,
    })
    .from(capitalAsset)
    .where(isNull(capitalAsset.deletedAt));

  // D7 fix — كشف الأصول اليتيمة (capital_asset نشط لكن مصدره محذوف/غير موجود).
  // استعلام منفصل لأنه يحتاج LEFT JOIN على expense/purchase (وليس aggregation
  // بسيط على capital_asset). source_type ∈ {'expense','purchase'} (CHECK).
  const orphanRows = await tx
    .select({
      id: capitalAsset.id,
      sourceType: capitalAsset.sourceType,
      sourceId: capitalAsset.sourceId,
    })
    .from(capitalAsset)
    .leftJoin(
      expense,
      and(
        eq(capitalAsset.sourceType, "expense"),
        eq(capitalAsset.sourceId, expense.id),
        isNull(expense.deletedAt),
      ),
    )
    .leftJoin(
      purchase,
      and(
        eq(capitalAsset.sourceType, "purchase"),
        eq(capitalAsset.sourceId, purchase.id),
        isNull(purchase.deletedAt),
      ),
    )
    .where(
      and(
        isNull(capitalAsset.deletedAt),
        // الأصل يتيم إن لم يطابق أي من الـ JOINs: أي expense.id AND purchase.id
        // كلاهما NULL (لأن capital_asset.source_type ∈ {'expense','purchase'} فقط،
        // فالصف يطابق JOIN واحد على الأكثر — والآخر NULL تلقائياً).
        sql`(${expense.id} IS NULL AND ${purchase.id} IS NULL)`,
      ),
    );

  const totalOriginalCents = Number(row?.totalOriginal) || 0;
  const totalDepreciatedToDateCents = Number(row?.totalDepreciated) || 0;
  const netBookValueCents = totalOriginalCents - totalDepreciatedToDateCents;
  const activeCount = Number(row?.activeCount) || 0;
  const fullyDepreciatedCount = Number(row?.fullyDepreciatedCount) || 0;
  const pendingCount = Number(row?.pendingCount) || 0;
  const orphanCount = orphanRows.length;

  return {
    totalOriginalCents,
    totalDepreciatedToDateCents,
    netBookValueCents,
    activeCount,
    fullyDepreciatedCount,
    pendingCount,
    orphanCount,
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
