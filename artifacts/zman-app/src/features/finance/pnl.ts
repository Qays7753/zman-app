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
// cash_movement (الإهلاك غير نقدي — INV-21). نستورد من depreciation/queries
// لأن استعلام الإهلاك موحَّد هناك ويُستخدَم أيضاً من IC-14.
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
 *                              INV-21 يستثني صراحةً INV-1 لهذا التعديل.
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
   * COGS يُخصَم عند البيع لمطابقة الإيراد بالتكلفة. INV-23.
   */
  cogsCents: number;
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
  //
  // Phase 3-revised (D4 fix): المشتريات المُرأسمَلة كمخزون (is_tracked_inventory=true)
  // تُستبعَد من operatingPurchasesCents أيضاً (مثل الرأسمالي). الشراء لمخزون متتبَّع
  // لا يخفض الربح التشغيلي في شهر الشراء — يُرأسمَل كمخزون، وتُخصَم تكلفته عند
  // البيع عبر COGS (القسم 3.5 أدناه). الصيغة:
  //   operatingPurchasesCents = Σ cash_movement.amountCents WHERE
  //     is_capital_asset = false AND is_tracked_inventory = false
  //   capitalPurchasesCents   = Σ cash_movement.amountCents WHERE is_capital_asset = true
  //   trackedPurchasesCents   = Σ cash_movement.amountCents WHERE is_tracked_inventory = true
  // (ملاحظة: المشتريات المُرأسمَلة كمخزون لا تدخل capitalPurchasesCents لأنها لا
  // تُستهلَك كرأسمالي — هي مخزون سيُباع. تُعرض في الميزانية كـ inventoryValueCents
  // في getFinancialPosition، لا كـ capitalAdditionsCents.)
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
  const operatingPurchasesCents = Number(purchaseRow?.operating) || 0;
  const capitalPurchasesCents = Number(purchaseRow?.capital) || 0;
  // trackedPurchasesCents يُستعمل للتوثيق والمراجعة فقط — لا يدخل P&L ولا
  // capitalAdditions. هو التدفّق النقدي للمخزون المُرأسمَل.
  const trackedPurchasesCents = Number(purchaseRow?.tracked) || 0;
  void trackedPurchasesCents;

  // ─────────────────────────────────────────────────────────────────────────
  // 4. الإهلاك المحسوب للفترة (Phase 4 — خيار γ، D2 fix — period-aware).
  //
  // استعلام واحد على capital_asset: لكل صف نشط، يُحتسب إهلاك الفترة [startDate,
  // endDate] كالفرق بين months_elapsed عند endDate وعند effectiveStart =
  // max(started_at, startDate). إن startDate = null (range:"all" أو
  // getFinancialPosition) → monthsAtStart = 0 لكل أصل → النتيجة تراكمية حتى
  // endDate. هذا يُصلِح D2: قبل هذا التعديل كانت الدالة تُعيد SUM(monthly_dep)
  // لكل الأصول النشطة — أي حصة شهر واحد بغضّ النظر عن طول الفترة. فترة كل التاريخ
  // كانت تطرح شهراً واحداً فقط من إهلاك أصل عمره 10 أشهر (مثلاً).
  //
  // ⚠️ CRITICAL-NOTE-4 (SA1): نستخدم EXTRACT(YEAR FROM age) * 12 +
  // EXTRACT(MONTH FROM age) لحساب months_elapsed، لا date_part('month', age)
  // الذي يُرجِع 0-11 فقط (مكوّن الشهر، لا الإجمالي). لأصل عمره 14 شهراً:
  // date_part = 2 (خطأ، يستمر الإهلاك بعد انقضاء العمر)؛ EXTRACT = 14 (صحيح).
  // لا تغيير على هذه الصيغة — راجع depreciation/queries.ts.
  //
  // ⚠️ الإهلاك غير نقدي: لا يُدرَج أي حركة في cash_movement. هو تعديل محسوب
  // يُخصم من operatingNetCents فقط. INV-21 يستثني صراحةً INV-1 لهذا التعديل.
  //
  // التأثير على getFinancialPosition (IC-1, IC-6):
  //   getFinancialPosition لا يستعمل operatingNetCents مباشرة — يبني retainedProfit
  //   محلياً من operatingExpensesCents + operatingPurchasesCents (cash-basis نقدي).
  //   لذلك retainedProfitCents لا يشمل الإهلاك، والميزانية تبقى cash-basis صرفة.
  //   IC-1 (equityDrift) و IC-6 (pnlReconciliation) لا يتأثران إطلاقاً.
  //   الفرق بين dashboard.netProfit (يضم الإهلاك) و retainedProfitCents (لا يضمه)
  //   = monthlyDepreciationCents (= إهلاك الفترة). هذا فصل مقصود بين «الربح
  //   التشغيلي المُعدَّل» (للعرض الإداري) و«الربح التشغيلي النقدي» (للميزانية).
  //   موثَّق في INV-21 و§10. تُعالَج تسمية البطاقتين في DashboardClient (D3 fix).
  // ─────────────────────────────────────────────────────────────────────────
  const monthlyDepreciationCents = await getDepreciationForPeriodCents(
    { startDate: startDate ?? null, endDate },
    tx,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4.5. COGS (تكلفة البضاعة المباعة) للفترة — Phase 3-revised (D4 fix).
  //
  // COGS = Σ (catalog_movement.quantity × coalesce(unit_cost_cents, 0))
  //        WHERE direction = 'out' AND source_type = 'order_delivery'
  //              AND deleted_at IS NULL AND date ∈ [startDate, endDate]
  //
  // هذه حركات الخصم التي تُنشئها deductForDelivery عند convertOrderToSale.
  // source_id = sale.id، لكن لا حاجة لـ JOIN sale — date على catalog_movement
  // = تاريخ البيع (يُضبط في addCatalogMovement من getAmmanDate()). coalesce على
  // unit_cost_cents يعالج الحالات النادرة التي قد لا تحتوي على cost (مخزون
  // افتتاحي بلا سعر، أو adjustStock يدوي).
  //
  // ⚠️ COGS تعديل غير نقدي (مثل الإهلاك): لا يُدرَج أي حركة في cash_movement.
  // النقد دخل بالكامل في salesCents (المتبقي + العربون المحوَّل). COGS يُخصم
  // من operatingNetCents لمطابقة الإيراد بالتكلفة في نفس الفترة.
  //
  // التأثير على getFinancialPosition (IC-1):
  //   retainedProfitCents = salesCashInCents − depositsLiability
  //                         − operatingExpensesCents − operatingPurchasesCents
  //                         − cogsCentsToDate
  //   inventoryValueCents = Σ(in qty × unit_cost) − Σ(out qty × unit_cost)
  //   totalAssets = Cash + inventoryValueCents
  // توازن IC-1 محفوظ: Cash يقل بمقدار trackedPurchasesCents (الشراء المُرأسمَل
  // لا يدخل operatingPurchasesCents)، لكن inventoryValueCents يزيد بنفس المقدار
  // فتبقى totalAssets كما كانت. عند البيع: Cash يزيد بـ salesCashInCents،
  // inventoryValueCents يقل بـ COGS، retainedProfitCents يقل بـ COGS، فتبقى
  // المعادلة متوازنة. موثَّق في INV-22 / INV-23 و§9 من ACCOUNTING_RULES.md.
  // ─────────────────────────────────────────────────────────────────────────
  const cogsConds = [
    eq(catalogMovement.direction, "out"),
    eq(catalogMovement.sourceType, "order_delivery"),
    isNull(catalogMovement.deletedAt),
    sql`${catalogMovement.date} <= ${endDate}`,
  ];
  if (startDate) cogsConds.push(sql`${catalogMovement.date} >= ${startDate}`);

  const [cogsRow] = await tx
    .select({
      total: sql<number>`coalesce(sum(${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)), 0)::bigint`,
    })
    .from(catalogMovement)
    .where(and(...cogsConds));
  const cogsCents = Number(cogsRow?.total) || 0;

  // ─────────────────────────────────────────────────────────────────────────
  // 5. التجميع النهائي.
  // ─────────────────────────────────────────────────────────────────────────
  const capitalAdditionsCents = capitalExpensesCents + capitalPurchasesCents;
  const operatingNetCents =
    salesCents -
    operatingExpensesCents -
    operatingPurchasesCents -
    cogsCents -
    monthlyDepreciationCents;

  return {
    salesCents,
    operatingExpensesCents,
    operatingPurchasesCents,
    capitalAdditionsCents,
    monthlyDepreciationCents,
    cogsCents,
    operatingNetCents,
  };
}
