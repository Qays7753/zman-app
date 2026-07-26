"use server";

import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { account, cashMovement, expense, purchase } from "./db";

/**
 * ============================================================================
 *  computeOperatingPnl — الدالة المركزية الموحِّدة للربح التشغيلي (LOCKED-6).
 * ============================================================================
 *
 *  لماذا هذه الدالة موجودة:
 *  ───────────────────────
 *  القرار 6 من الـ spec: «netProfit في dashboard.summary + reports.pnl +
 *  dashboard.monthlyProfit = رقم واحد بالضبط. أي انحراف = PR مرفوض.»
 *  لضمان ذلك بالبناء، كل تعريف inline للربح يُستبدَل باستدعاء هذه الدالة.
 *  IC-13 يحرس هذا التطابق وقت التشغيل في كل فحص سلامة.
 *
 *  ماذا تُرجع:
 *  ─────────
 *  - salesCents:               المقبوضات من المبيعات المكتملة (source_type='sale'
 *                              اتجاه 'in') للفترة — نفس المنطق القديم، لا تغيير.
 *  - operatingExpensesCents:   مصاريف تشغيلية مدفوعة (out, source='expense')
 *                              مع COALESCE(is_capital_asset, false) = false.
 *                              الرأسمالي مُستبعَد.
 *  - operatingPurchasesCents:  مشتريات تشغيلية مدفوعة (out, source='purchase')
 *                              مع is_capital_asset = false.
 *                              الرأسمالي مُستبعَد.
 *  - capitalAdditionsCents:    إضافات رأسمالية = مصاريف رأسمالية + مشتريات
 *                              رأسمالية. تُعرض سطراً منفصلاً في الميزانية
 *                              (تُخصم من totalEquity للحفاظ على IC-1 — انظر
 *                              reports/actions.ts:getFinancialPosition).
 *  - operatingNetCents:        = salesCents − operatingExpensesCents
 *                                − operatingPurchasesCents.
 *                              هذا هو «الربح التشغيلي». Phase 4 ستطرح منه
 *                              monthlyDepreciationCents لاحقاً.
 *
 *  المعاملات:
 *  ─────────
 *  - startDate?: YYYY-MM-DD — بداية الفترة. إن لم يُمرَّر، لا حدّ أدنى (كل
 *    التاريخ حتى endDate) — يُستعمل لـ getFinancialPosition (as-of).
 *  - endDate:   YYYY-MM-DD — نهاية الفترة (عادةً اليوم أو asOfDate).
 *  - tx = db:   كائن المعاملة. يُمرَّر tx صراحةً من الاستدعاءات داخل معاملة
 *    (reports/getFinancialPosition) ويبقى db افتراضياً للاستدعاءات العلوية
 *    (dashboard/queries). نفس نمط computeCashBasisPnl(range, tx = db).
 *
 *  تصميم الاستعلامات:
 *  ─────────────────
 *  - 3 استعلامات فقط لكل استدعاء (sales, expenses, purchases). كل واحد يجمع
 *    بشكل شرطي (CASE WHEN) ليُرجَع operating+capital في استعلام واحد.
 *  - LEFT JOIN على expense/purchase ضروري لأن الحركة قد لا تجد صفّاً匹配اً
 *    نظرياً (INV-2 يمنع ذلك في التشغيل السليم، لكن الدفاع استباقي). COALESCE
 *    على is_capital_asset يُعامِل NULL كـ false (صف قديم غير مُصنَّف =
 *    تشغيلي).
 *  - لا يُعدَّل أي شيء في القاعدة. الدالة للقراءة فقط وآمنة للتشغيل في أي وقت.
 *
 *  المخاطر:
 *  ──────
 *  عالية. أي خطأ = dashboard و reports يُظهران أرقاماً مختلفة → IC-13 = FAIL.
 *  IC-13 + اختبار الوحدة (مطلوب في spec بطاقة 2.E/2.F) يحرسان التطابق.
 * ============================================================================
 */

export interface OperatingPnlResult {
  salesCents: number;
  operatingExpensesCents: number;
  operatingPurchasesCents: number;
  capitalAdditionsCents: number;
  operatingNetCents: number;
}

export interface ComputeOperatingPnlParams {
  /** بداية الفترة (YYYY-MM-DD). اختياري — إن غاب، لا حدّ أدنى (كل التاريخ). */
  startDate?: string;
  /** نهاية الفترة (YYYY-MM-DD). مطلوب. */
  endDate: string;
  /** كائن المعاملة. افتراضياً db (لا معاملة). يُمرَّر tx من getFinancialPosition. */
  tx?: any;
}

export async function computeOperatingPnl({
  startDate,
  endDate,
  tx = db,
}: ComputeOperatingPnlParams): Promise<OperatingPnlResult> {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. المبيعات المكتملة — نفس منطق computeCashBasisPnl القديم (لا تغيير).
  //    العربون (source_type='deposit') لا يدخل هنا — هو التزام حتى التسليم
  //    (INV-3, INV-4) ولا يُعدّ ربحاً.
  // ─────────────────────────────────────────────────────────────────────────
  const salesConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "in"),
    eq(cashMovement.sourceType, "sale"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) salesConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const [salesRow] = await tx
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(and(...salesConds));
  const salesCents = Number(salesRow?.total) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. المصاريف — استعلام واحد يجمع التشغيلي والرأسمالي بشكل شرطي.
  //    LEFT JOIN على expense ضروري للوصول إلى is_capital_asset. COALESCE
  //    يعالج NULL (صف قديم غير مُصنَّف = تشغيلي، يُطرح من P&L كما كان دائماً).
  // ─────────────────────────────────────────────────────────────────────────
  const expenseConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "out"),
    eq(cashMovement.sourceType, "expense"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) expenseConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const [expenseRow] = await tx
    .select({
      operating: sql<number>`coalesce(sum(case when coalesce(${expense.isCapitalAsset}, false) = false then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
      capital: sql<number>`coalesce(sum(case when coalesce(${expense.isCapitalAsset}, false) = true  then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
    })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .leftJoin(
      expense,
      and(
        eq(cashMovement.sourceType, "expense"),
        eq(cashMovement.sourceId, expense.id),
      ),
    )
    .where(and(...expenseConds));
  const operatingExpensesCents = Number(expenseRow?.operating) || 0;
  const capitalExpensesCents = Number(expenseRow?.capital) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 3. المشتريات — نفس نمط المصاريف.
  // ─────────────────────────────────────────────────────────────────────────
  const purchaseConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "out"),
    eq(cashMovement.sourceType, "purchase"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) purchaseConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const [purchaseRow] = await tx
    .select({
      operating: sql<number>`coalesce(sum(case when coalesce(${purchase.isCapitalAsset}, false) = false then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
      capital: sql<number>`coalesce(sum(case when coalesce(${purchase.isCapitalAsset}, false) = true  then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
    })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .leftJoin(
      purchase,
      and(
        eq(cashMovement.sourceType, "purchase"),
        eq(cashMovement.sourceId, purchase.id),
      ),
    )
    .where(and(...purchaseConds));
  const operatingPurchasesCents = Number(purchaseRow?.operating) || 0;
  const capitalPurchasesCents = Number(purchaseRow?.capital) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 4. التجميع النهائي.
  // ─────────────────────────────────────────────────────────────────────────
  const capitalAdditionsCents = capitalExpensesCents + capitalPurchasesCents;
  const operatingNetCents =
    salesCents - operatingExpensesCents - operatingPurchasesCents;

  return {
    salesCents,
    operatingExpensesCents,
    operatingPurchasesCents,
    capitalAdditionsCents,
    operatingNetCents,
  };
}
