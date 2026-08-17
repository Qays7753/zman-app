"use server";

import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { account, cashMovement, expense, purchase } from "./db";
// Phase 3-revised (D4 fix) — catalogMovement لحساب COGS (تكلفة البضاعة المباعة)
// من الحركات `out` المرتبطة بالمبيعات (source_type='order_delivery').
// source_id على catalog_movement = sale.id — لكن لا حاجة لـ JOIN sale لأن
// catalog_movement.date = تاريخ البيع (يُضبط في addCatalogMovement).
import { catalogMovement } from "../inventory/db";
// Phase 4 — capital_asset للإهلاك (محسوب عند القراءة، خيار γ). لا FK إلى
// cash_movement (الإهلاك غير نقدي — INV-22 بعد إعادة الترقيم D10). نستورد من
// depreciation/queries لأن استعلام الإهلاك موحَّد هناك ويُستخدَم أيضاً من IC-14.
import { getDepreciationForPeriodCents } from "../depreciation/queries";

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
 *  - monthlyDepreciationCents: (Phase 4 — D2 fix) إهلاك الفترة [startDate, endDate]
 *                              المحسوب = SUM(Δmonths_elapsed × monthly_dep) لكل
 *                              صف في capital_asset نشط. غير نقدي — لا حركة في
 *                              cash_movement. لـ range:"all" → تراكمي حتى endDate.
 *                              INV-22 يستثني صراحةً INV-1 لهذا التعديل.
 *  - operatingNetCents:        = salesCents − operatingExpensesCents
 *                                − operatingPurchasesCents
 *                                − monthlyDepreciationCents.
 *                              هذا هو «الربح التشغيلي» (معدَّل بإهلاك غير نقدي
 *                              — خيار γ من بطاقة 4.A).
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
  /**
   * Phase 4 — إهلاك الفترة المحسوب للأصول النشطة (period-aware بعد D2 fix).
   * غير نقدي (لا يدخل cash_movement).
   */
  monthlyDepreciationCents: number;
  /**
   * Phase 3-revised (D4 fix) — COGS (تكلفة البضاعة المباعة) للفترة = Σ(quantity × unit_cost_cents)
   * لحركات catalog_movement `out` بـ source_type='order_delivery' نشطة (deletedAt IS NULL)
   * ضمن [startDate, endDate]. غير نقدي — تعديل محسوب عند القراءة (مثل الإهلاك).
   * عكس الشراء المُرأسمَل (is_tracked_inventory=true) الذي لم يُخصَم من P&L عند الشراء.
   * COGS يُخصَم عند البيع لمطابقة الإيراد بالتكلفة. INV-24.
   */
  cogsCents: number;
  /**
   * SA1 (Round 4 — A-1 fix) — هدر/تلف المخزون اليدوي للفترة = Σ(expense.amount_cents)
   * لصفوف expense بـ is_inventory_writeoff=true نشطة (deleted_at IS NULL) ضمن
   * [startDate, endDate]. غير نقدي تماماً — لا cash_movement مرتبطة (الخسارة
   * تُسجَّل عبر adjustStock direction='out' مع total_value_cents > 0 فقط).
   *
   * لماذا بند مستقل وليس داخل operatingExpensesCents؟ لأن operatingExpensesCents
   * يُشتق من cash_movement (LEFT JOIN إلى expense) — صف expense بلا cash_movement
   * لا يُلتقَط هناك. نقرأ الـ write-off مباشرةً من جدول expense بفلتر
   * is_inventory_writeoff=true (نفس فكرة COGS من catalog_movement). يُخصم من
   * operatingNetCents. موثَّق في INV-25 / §9 من ACCOUNTING_RULES.md.
   */
  inventoryWriteOffCents: number;
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
  // 1. استعلامات متوازية (Phase 1 — توازي الاستعلامات المالية):
  //    كل الاستعلامات الستة قراءة مستقلة تماماً لا يعتمد أي منها على الآخر.
  //    تُطلَق كلها في Promise.all واحد لتقليل عدد رحلات الشبكة المتسلسلة.
  // ─────────────────────────────────────────────────────────────────────────

  // 1.1 المبيعات المكتملة
  const salesConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "in"),
    eq(cashMovement.sourceType, "sale"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) salesConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const salesPromise = tx
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(and(...salesConds));

  // 1.2 المصاريف (تشغيلي + رأسمالي شرطياً)
  const expenseConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "out"),
    eq(cashMovement.sourceType, "expense"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) expenseConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const expensePromise = tx
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

  // 1.3 المشتريات (تشغيلي + رأسمالي + مخزون مرأسمَل شرطياً)
  const purchaseConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    eq(cashMovement.direction, "out"),
    eq(cashMovement.sourceType, "purchase"),
    sql`${cashMovement.date} <= ${endDate}`,
  ];
  if (startDate) purchaseConds.push(sql`${cashMovement.date} >= ${startDate}`);

  const purchasePromise = tx
    .select({
      operating: sql<number>`coalesce(sum(case when coalesce(${purchase.isCapitalAsset}, false) = false AND coalesce(${purchase.isTrackedInventory}, false) = false then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
      capital: sql<number>`coalesce(sum(case when coalesce(${purchase.isCapitalAsset}, false) = true  then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
      tracked: sql<number>`coalesce(sum(case when coalesce(${purchase.isCapitalAsset}, false) = false AND coalesce(${purchase.isTrackedInventory}, false) = true  then ${cashMovement.amountCents} else 0 end), 0)::bigint`,
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

  // 1.4 الإهلاك المحسوب للفترة (غير نقدي — آمن للتوازي)
  const depreciationPromise = getDepreciationForPeriodCents(
    { startDate: startDate ?? null, endDate },
    tx,
  );

  // 1.5 COGS (تكلفة البضاعة المباعة) للفترة
  const cogsConds = [
    eq(catalogMovement.direction, "out"),
    eq(catalogMovement.sourceType, "order_delivery"),
    isNull(catalogMovement.deletedAt),
    sql`${catalogMovement.date} <= ${endDate}`,
  ];
  if (startDate) cogsConds.push(sql`${catalogMovement.date} >= ${startDate}`);

  const cogsPromise = tx
    .select({
      total: sql<number>`coalesce(sum(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))), 0)::bigint`,
    })
    .from(catalogMovement)
    .where(and(...cogsConds));

  // 1.6 هدر/تلف المخزون اليدوي للفترة (غير نقدي)
  const writeOffConds = [
    eq(expense.isInventoryWriteoff, true),
    isNull(expense.deletedAt),
    sql`${expense.date} <= ${endDate}`,
  ];
  if (startDate) writeOffConds.push(sql`${expense.date} >= ${startDate}`);

  const writeOffPromise = tx
    .select({
      total: sql<number>`coalesce(sum(${expense.amountCents}), 0)::bigint`,
    })
    .from(expense)
    .where(and(...writeOffConds));

  // ─────────────────────────────────────────────────────────────────────────
  // تنفيذ كل الاستعلامات الستة بالتوازي في رحلة واحدة
  // ─────────────────────────────────────────────────────────────────────────
  const [
    [salesRow],
    [expenseRow],
    [purchaseRow],
    monthlyDepreciationCents,
    [cogsRow],
    [writeOffRow],
  ] = await Promise.all([
    salesPromise,
    expensePromise,
    purchasePromise,
    depreciationPromise,
    cogsPromise,
    writeOffPromise,
  ]);

  const salesCents = Number(salesRow?.total) || 0;
  const operatingExpensesCents = Number(expenseRow?.operating) || 0;
  const capitalExpensesCents = Number(expenseRow?.capital) || 0;
  const operatingPurchasesCents = Number(purchaseRow?.operating) || 0;
  const capitalPurchasesCents = Number(purchaseRow?.capital) || 0;
  const trackedPurchasesCents = Number(purchaseRow?.tracked) || 0;
  void trackedPurchasesCents;
  const cogsCents = Number(cogsRow?.total) || 0;
  const inventoryWriteOffCents = Number(writeOffRow?.total) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 2. التجميع النهائي
  // ─────────────────────────────────────────────────────────────────────────
  const capitalAdditionsCents = capitalExpensesCents + capitalPurchasesCents;
  const operatingNetCents =
    salesCents -
    operatingExpensesCents -
    operatingPurchasesCents -
    cogsCents -
    inventoryWriteOffCents -
    monthlyDepreciationCents;

  return {
    salesCents,
    operatingExpensesCents,
    operatingPurchasesCents,
    capitalAdditionsCents,
    monthlyDepreciationCents,
    cogsCents,
    inventoryWriteOffCents,
    operatingNetCents,
  };
}
