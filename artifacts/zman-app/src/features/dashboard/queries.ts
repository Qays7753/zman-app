"use server";

import { and, desc, isNull, sql, eq, sum } from "drizzle-orm";
import { expense, purchase, sale, cashMovement, account } from "@/features/finance/db";
import { order } from "@/features/orders/db";
import { catalogMovement } from "@/features/inventory/db";
import { db } from "@/lib/db/client";
import { computeOperatingPnl } from "@/features/finance/pnl";
import { getAccountBalances, getOpeningBalance } from "@/features/finance/actions";
import { type OpeningBalance } from "@/features/finance/db";
import { getFinancialPosition, type FinancialPositionData } from "@/features/reports/actions";
import { getInventoryValuation } from "@/features/inventory/queries";
import { getAllCapitalAssets } from "@/features/depreciation/assetsQueries";
import { getAmmanDate, getAmmanMonthBounds } from "@/lib/utils";

export interface FinancialSummary {
  sales: number;
  actualSales: number;
  deposits: number;
  expenses: number;
  purchases: number;
  netProfit: number;
  /** Phase 2 — إضافات رأسمالية للفترة (مُستبعَدة من netProfit التشغيلي). */
  capitalAdditionsCents: number;
  /**
   * Phase 4 — D2 fix: إهلاك الفترة [startDate, endDate] المحسوب (period-aware).
   * غير نقدي. مُخصوم من netProfit. معرَض على الـ dashboard لإظهار الفرق بين
   * «الربح التشغيلي (بعد الإهلاك)» و«الربح النقدي المحتجز (قبل الإهلاك)» (D3 fix).
   * مصدره computeOperatingPnl — نفس المسار الموحِّد الذي يُغذّي netProfit (LOCKED-6).
   */
  monthlyDepreciationCents: number;
  ownerNet: number;
  ownerInject: number;
  ownerDraw: number;
  /**
   * SA4 (Part C) — قيمة المخزون المتتبَّع as-of endDate (point-in-time، لا flow).
   * = Σ(in total_value_cents) − Σ(out total_value_cents) من catalog_movement
   * (deletedAt IS NULL، date <= endDate) — نفس صيغة getFinancialPosition
   * تماماً (لا منطق جديد — نفس SQL، نفس الـ coalesce على total_value_cents
   * للحركات القديمة بلا total_value_cents). يُعاد على الـ dashboard لكي لا
   * يضطر المالك لفتح /reports لرؤية قيمة مخزونه. SA1 Part C flag #2.
   * Zero-state: قد يكون 0 إن لم تُسجَّل حركات مخزون أو افترقت كل الوارد بالمصروف.
   * الـ dashboard card يُظهره دائماً (حتى عند 0) — لا يختفي.
   */
  inventoryValueCents: number;
  /**
   * SA4 (Part C) — COGS التراكمي حتى endDate (كل التاريخ، لا حدّ أدنى).
   * = Σ(out total_value_cents) من catalog_movement (source_type='order_delivery'
   * deletedAt IS NULL، date <= endDate). نفس صيغة computeOperatingPnl.cogsCents
   * في وضع range:"all" (startDate=undefined). معرَض هنا للتوحيد مع
   * getFinancialPosition.cogsCentsToDate — لا يُعرض حالياً كبطاقة على الـ dashboard
   * (الـ retained profit في بطاقة «الربح مقابل السيولة» يطرحه ضمنياً) لكنه معرَض
   * للتمكين من عرضه مستقبلاً. SA1 Part C flag #2.
   */
  cogsCentsToDate: number;
  /**
   * UX Round 4 — COGS تكلفة البضاعة المباعة للفترة المختارة [startDate, endDate].
   * = Σ(out total_value_cents) من catalog_movement (source_type='order_delivery')
   * مقيَّدة بالفترة. مصدرها operatingPnl.cogsCents من computeOperatingPnl — لا
   * استعلام إضافي. تُعرَض في FinanceComparePanel بدلاً من «مشتريات» لإظهار
   * التكلفة الحقيقية المُطرحة من الربح (مطابقة الإيراد بالتكلفة — COGS، لا cash out).
   */
  cogsCents: number;
  /**
   * Fix A (Audit Round 5) — المصاريف التشغيلية فقط (is_capital_asset = false)
   * مصدرها operatingPnl.operatingExpensesCents — لا استعلام إضافي.
   * تُمرَّر لـ FinanceComparePanel بدلاً من summary.expenses (الذي يشمل الرأسمالي)
   * لضمان تطابق الشريط مع ما يُطرح فعلاً من netProfit.
   */
  operatingExpensesCents: number;
  /**
   * Fix B (Audit Round 5) — المشتريات التشغيلية (is_capital_asset=false, is_tracked_inventory=false)
   * مصدرها operatingPnl.operatingPurchasesCents — لا استعلام إضافي.
   * تُعرض كشريط رابع في FinanceComparePanel لأنها تُطرح من netProfit وكانت غير مرئية.
   */
  operatingPurchasesCents: number;
}

export interface ActivityItem {
  id: string;
  type: "order" | "sale" | "expense" | "purchase";
  title: string;
  amount: number;
  date: Date;
  metadata?: string;
  hasCashImpact?: boolean;
}

// 1. حساب المخلص المالي للفترة المحددة (§12) بالتوازي
export async function getFinancialSummary(
  startDate: string,
  endDate: string,
): Promise<FinancialSummary> {
  // D1: cash-basis revenue = cash received from customers in the period
  const actualSalesPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "sale"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const depositsPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "deposit"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const expensesPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "expense"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const purchasesPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "purchase"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const ownerInjectPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "owner_inject"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const ownerDrawPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "owner_draw"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  // SA4 (Part C) — قيمة المخزون المتتبَّع as-of endDate. نفس صيغة
  // getFinancialPosition.inventoryValueCents تماماً (لا منطق جديد — شاهد
  // تعليق inventoryValueCents في الواجهة أعلاه). استعلام واحد على
  // catalog_movement. الـ fallback إلى `qty × coalesce(unit_cost_cents, 0)`
  // يحافظ على التوافق مع الحركات القديمة (قبل migration 0024).
  const inventoryValuePromise = db
    .select({
      total: sql<any>`coalesce(sum(
        case when ${catalogMovement.direction} = 'in'
             then coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))
             else -(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)))
        end
      ), 0)::bigint`,
    })
    .from(catalogMovement)
    .where(
      and(
        isNull(catalogMovement.deletedAt),
        sql`${catalogMovement.date} <= ${endDate}`,
      ),
    );

  // SA4 (Part C) — COGS التراكمي حتى endDate. نفس صيغة
  // computeOperatingPnl.cogsCents في وضع range:"all" (startDate=undefined).
  // = Σ(out total_value_cents) WHERE source_type='order_delivery' AND date <= endDate.
  // استعلام واحد على catalog_movement — لا نداء لـ computeOperatingPnl ثاني
  // تجنباً لإعادة استعلامات المصاريف والمشتريات والإهلاك بلا داعٍ.
  const cogsToDatePromise = db
    .select({
      total: sql<any>`coalesce(sum(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))), 0)::bigint`,
    })
    .from(catalogMovement)
    .where(
      and(
        eq(catalogMovement.direction, "out"),
        eq(catalogMovement.sourceType, "order_delivery"),
        isNull(catalogMovement.deletedAt),
        sql`${catalogMovement.date} <= ${endDate}`,
      ),
    );

  // Fix connection pool exhaustion by awaiting sequentially
  const actualSalesResult = await actualSalesPromise;
  const depositsResult = await depositsPromise;
  const expensesResult = await expensesPromise;
  const purchasesResult = await purchasesPromise;
  const ownerInjectResult = await ownerInjectPromise;
  const ownerDrawResult = await ownerDrawPromise;
  const inventoryValueResult = await inventoryValuePromise;
  const cogsToDateResult = await cogsToDatePromise;
  const operatingPnl = await computeOperatingPnl({ startDate, endDate });

  const actualSales = Number(actualSalesResult[0]?.total) || 0;
  const deposits = Number(depositsResult[0]?.total) || 0;
  const sales = actualSales + deposits;
  const expenses = Number(expensesResult[0]?.total) || 0;
  const purchases = Number(purchasesResult[0]?.total) || 0;
  // Phase 2 — الربح التشغيلي عبر computeOperatingPnl الموحَّدة. الرأسمالي
  // مُستبعَد. هذه الدالة نفسها تُستدعى من reports.pnl و monthlyProfit → التطابق
  // مضمون بالبناء (LOCKED-6)، ويحرسه IC-13.
  // actualSales/deposits/expenses/purchases أعلاه تبقى كما هي (تضم الرأسمالي)
  // لأنها أرقام «السيولة» المعروضة في لوحة المقارنة، لا الربح.
  const netProfit = operatingPnl.operatingNetCents;
  const capitalAdditionsCents = operatingPnl.capitalAdditionsCents;
  // Phase 4 — D2 fix: إهلاك الفترة (period-aware). معرَض على الـ dashboard لإظهار
  // الفرق بين «الربح التشغيلي (بعد الإهلاك)» و«الربح النقدي المحتجز (قبل الإهلاك)»
  // (D3 fix). مصدره نفس operatingPnl الموحَّد — لا مسار منفصل (LOCKED-6 محفوظ).
  const monthlyDepreciationCents = operatingPnl.monthlyDepreciationCents;
  const ownerInject = Number(ownerInjectResult[0]?.total) || 0;
  const ownerDraw = Number(ownerDrawResult[0]?.total) || 0;
  const ownerNet = ownerInject - ownerDraw;
  // SA4 (Part C) — قيمة المخزون وCOGS التراكمي. نفس الصيغة المُستخدَمة في
  // getFinancialPosition — لا منطق جديد. معرَضة هنا كي لا يحتاج الـ dashboard
  // للاعتماد على position كي يُظهر بطاقة المخزون (تفادي اختفاء البطاقة عند
  // فشل/تأخّر position).
  const inventoryValueCents = Number(inventoryValueResult[0]?.total) || 0;
  const cogsCentsToDate = Number(cogsToDateResult[0]?.total) || 0;
  // UX Round 4 — COGS للفترة من computeOperatingPnl (لا استعلام إضافي).
  const cogsCents = operatingPnl.cogsCents;
  // Fix A+B (Audit Round 5) — مصاريف تشغيلية ومشتريات تشغيلية من computeOperatingPnl.
  // لا استعلامات إضافية — القيم محسوبة بالفعل داخل operatingPnl.
  const operatingExpensesCents = operatingPnl.operatingExpensesCents;
  const operatingPurchasesCents = operatingPnl.operatingPurchasesCents;

  return { sales, actualSales, deposits, expenses, purchases, netProfit, capitalAdditionsCents, monthlyDepreciationCents, ownerNet, ownerInject, ownerDraw, inventoryValueCents, cogsCentsToDate, cogsCents, operatingExpensesCents, operatingPurchasesCents };
}

// 2. جلب آخر النشاطات عبر الجداول الأربعة بشكل متوازٍ (§5.7)
export async function getRecentActivities(
  startDate?: string,
  endDate?: string,
): Promise<ActivityItem[]> {
  // F-26: استخدم تاريخ العمل (.date / receivedDate) لا createdAt ليتسق مع باقي
  // لوحة القيادة (التي تُصفّي حسب cashMovement.date).
  const orderCond = [isNull(order.deletedAt)];
  const saleCond = [isNull(sale.deletedAt)];
  const expenseCond = [isNull(expense.deletedAt)];
  const purchaseCond = [isNull(purchase.deletedAt)];

  if (startDate) {
    orderCond.push(sql`${order.receivedDate} >= ${startDate}::date`);
    saleCond.push(sql`${sale.date} >= ${startDate}::date`);
    expenseCond.push(sql`${expense.date} >= ${startDate}::date`);
    purchaseCond.push(sql`${purchase.date} >= ${startDate}::date`);
  }
  if (endDate) {
    orderCond.push(sql`${order.receivedDate} <= ${endDate}::date`);
    saleCond.push(sql`${sale.date} <= ${endDate}::date`);
    expenseCond.push(sql`${expense.date} <= ${endDate}::date`);
    purchaseCond.push(sql`${purchase.date} <= ${endDate}::date`);
  }

  const [recentOrders, recentSales, recentExpenses, recentPurchases] =
    await Promise.all([
      db
        .select({
          id: order.id,
          customerName: order.customerName,
          totalPriceCents: order.totalPriceCents,
          depositCents: order.depositCents,
          receivedDate: order.receivedDate,
          status: order.status,
        })
        .from(order)
        .where(and(...orderCond))
        .orderBy(desc(order.receivedDate))
        .limit(5),
      db
        .select({
          id: sale.id,
          description: sale.description,
          amountCents: sale.amountCents,
          date: sale.date,
        })
        .from(sale)
        .where(and(...saleCond))
        .orderBy(desc(sale.date))
        .limit(5),
      db
        .select({
          id: expense.id,
          category: expense.category,
          amountCents: expense.amountCents,
          date: expense.date,
        })
        .from(expense)
        .where(and(...expenseCond))
        .orderBy(desc(expense.date))
        .limit(5),
      db
        .select({
          id: purchase.id,
          item: purchase.item,
          totalCents: purchase.totalCents,
          date: purchase.date,
        })
        .from(purchase)
        .where(and(...purchaseCond))
        .orderBy(desc(purchase.date))
        .limit(5),
    ]);

  // تحويل ودمج البيانات — F-26: استخدم تاريخ العمل (date/receivedDate).
  // F-28: للطلبات المُسلَّمة، لا نُظهر العربون كصف مستقل (أصبح داخل المبيعة).
  const activities: ActivityItem[] = [
    ...recentOrders
      .filter((o) => {
        // F-28: تخطَّى الطلبات المُسلَّمة — العربون تحوّل إلى sale ولا يجب أن
        // يظهر مرتين (مرة كعربون ومرة داخل المبيعة).
        return o.status !== "delivered";
      })
      .map((o) => ({
        id: o.id,
        type: "order" as const,
        title: `طلب جديد بقيمة ${(o.totalPriceCents / 1000).toFixed(3)} د.أ`,
        amount: o.depositCents || 0,
        hasCashImpact: (o.depositCents || 0) > 0,
        date: new Date(o.receivedDate),
      })),
    ...recentSales.map((s) => ({
      id: s.id,
      type: "sale" as const,
      title: s.description || "عملية مبيعات",
      amount: s.amountCents,
      date: new Date(s.date),
      hasCashImpact: true,
    })),
    ...recentExpenses.map((e) => ({
      id: e.id,
      type: "expense" as const,
      title: `مصروف: ${e.category}`,
      amount: e.amountCents,
      date: new Date(e.date),
      hasCashImpact: true,
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      type: "purchase" as const,
      title: `شراء مواد: ${p.item}`,
      amount: p.totalCents,
      date: new Date(p.date),
      hasCashImpact: true,
    })),
  ];

  // ترتيب النشاطات تنازلياً وأخذ آخر 8 فقط
  return activities
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);
}

// 3. جلب بيانات التوجه المالي للرسم البياني لآخر 30 يوماً بالتوازي
export async function getFinancialTrendData(
  startDate: string,
  endDate: string,
) {
  const [salesTrend, expensesTrend, purchasesTrend] = await Promise.all([
    db
      .select({
        day: cashMovement.date,
        total: sql<any>`sum(${cashMovement.amountCents})::bigint`,
      })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          isNull(cashMovement.deletedAt),
          isNull(account.deletedAt),
          eq(cashMovement.direction, "in"),
          eq(cashMovement.sourceType, "sale"),
          sql`${cashMovement.date} >= ${startDate}`,
          sql`${cashMovement.date} <= ${endDate}`,
        ),
      )
      .groupBy(cashMovement.date),
    db
      .select({
        day: cashMovement.date,
        total: sql<any>`sum(${cashMovement.amountCents})::bigint`,
      })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          isNull(cashMovement.deletedAt),
          isNull(account.deletedAt),
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "expense"),
          sql`${cashMovement.date} >= ${startDate}`,
          sql`${cashMovement.date} <= ${endDate}`,
        ),
      )
      .groupBy(cashMovement.date),
    db
      .select({
        day: cashMovement.date,
        total: sql<any>`sum(${cashMovement.amountCents})::bigint`,
      })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          isNull(cashMovement.deletedAt),
          isNull(account.deletedAt),
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "purchase"),
          sql`${cashMovement.date} >= ${startDate}`,
          sql`${cashMovement.date} <= ${endDate}`,
        ),
      )
      .groupBy(cashMovement.date),
  ]);

  return {
    salesTrend: salesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
    expensesTrend: expensesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
    purchasesTrend: purchasesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
  };
}

export interface TopExpenseCategory {
  category: string;
  totalCents: number;
  count: number;
}

export interface UpcomingOrder {
  id: string;
  customerName: string;
  productName: string;
  deliveryDate: string | null;
  totalPriceCents: number;
  depositCents: number;
}

export interface DashboardStats {
  ordersByStatus: Record<string, number>;
  upcomingOrders: UpcomingOrder[];
  topExpenses: TopExpenseCategory[];
}

export async function getDashboardStats(
  startDate: string,
  endDate: string,
): Promise<DashboardStats> {
  const [statusPromise, upcomingPromise, expensesPromise] = await Promise.all([
    db
      .select({
        status: order.status,
        count: sql<number>`count(${order.id})::int`,
      })
      .from(order)
      .where(
        and(
          isNull(order.deletedAt),
          sql`${order.receivedDate} >= ${startDate}`,
          sql`${order.receivedDate} <= ${endDate}`,
        )
      )
      .groupBy(order.status),
    db
      .select({
        id: order.id,
        customerName: order.customerName,
        productName: order.productName,
        deliveryDate: sql<string>`TO_CHAR(${order.deliveryDate}::date, 'YYYY-MM-DD')`,
        totalPriceCents: order.totalPriceCents,
        depositCents: order.depositCents,
      })
      .from(order)
      .where(
        and(
          isNull(order.deletedAt),
          sql`${order.status} not in ('delivered', 'cancelled')`,
          sql`${order.deliveryDate} >= (now() AT TIME ZONE 'Asia/Amman')::date`,
          sql`${order.deliveryDate} <= ((now() AT TIME ZONE 'Asia/Amman')::date + INTERVAL '7 days')`,
        ),
      )
      .orderBy(order.deliveryDate)
      .limit(10),
    // أبرز فئات المصاريف (للفترة المختارة) — من دفتر الصندوق (cash_movement) لا من جدول expense
    // مربوط بـ expense لاستعادة الفئة، وبـ account لاستبعاد الحسابات المحذوفة. أساس نقدي متّسق مع باقي الأرقام.
    db
      .select({
        category: expense.category,
        totalCents: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .innerJoin(
        expense,
        and(eq(cashMovement.sourceType, "expense"), eq(cashMovement.sourceId, expense.id))
      )
      .where(
        and(
          isNull(cashMovement.deletedAt),
          isNull(account.deletedAt),
          eq(cashMovement.direction, "out"),
          sql`${cashMovement.date} >= ${startDate}`,
          sql`${cashMovement.date} <= ${endDate}`
        )
      )
      .groupBy(expense.category)
      .orderBy(desc(sum(cashMovement.amountCents)))
      .limit(3),
  ]);

  const ordersByStatus: Record<string, number> = {
    draft: 0,
    sent: 0,
    confirmed: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of statusPromise) {
    ordersByStatus[row.status] = row.count;
  }

  const upcomingOrders = upcomingPromise.map((o) => ({
    id: o.id,
    customerName: o.customerName,
    productName: o.productName,
    deliveryDate: o.deliveryDate,
    totalPriceCents: o.totalPriceCents,
    depositCents: o.depositCents || 0,
  }));

  const topExpenses = expensesPromise.map((e) => ({
    category: e.category,
    totalCents: Number(e.totalCents) || 0,
    count: e.count,
  }));

  return { ordersByStatus, upcomingOrders, topExpenses };
}

export interface CashSummary {
  depositsHeldCents: number;
  expectedRemainingCents: number;
}

export async function getCashSummary(): Promise<CashSummary> {
  const [result] = await db
    .select({
      depositsHeldCents: sql<any>`coalesce(sum(${order.depositCents}), 0)::bigint`,
      expectedRemainingCents: sql<any>`coalesce(sum(${order.totalPriceCents} + ${order.additionalProfitCents} - ${order.depositCents}), 0)::bigint`,
    })
    .from(order)
    .where(
      and(
        isNull(order.deletedAt),
        sql`${order.status} not in ('delivered', 'cancelled')`
      )
    );

  return {
    depositsHeldCents: Number(result?.depositsHeldCents) || 0,
    expectedRemainingCents: Number(result?.expectedRemainingCents) || 0,
  };
}

/**
 * متوسط الإنفاق الشهري (مشتريات + مصاريف) على آخر N أشهر.
 * استعلام للقراءة فقط — لا يغيّر أي منطق مالي.
 */
export async function getAverageMonthlySpend(months: number = 3): Promise<number> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const [result] = await db
    .select({
      total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint`,
    })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "out"),
        sql`${cashMovement.sourceType} in ('purchase', 'expense')`,
        sql`${cashMovement.date} >= ${startDate.toLocaleDateString("en-CA")}`,
        sql`${cashMovement.date} <= ${endDate.toLocaleDateString("en-CA")}`,
      ),
    );

  const totalSpend = Number(result?.total) || 0;
  return Math.round(totalSpend / months);
}

export interface MonthlyProfit {
  month: string; // 'YYYY-MM'
  label: string; // 'يوليو 2026'
  netProfitCents: number;
}

const AR_MONTHS_SHORT = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/**
 * ربح كل شهر (أساس نقدي، تشغيلي) لآخر N أشهر — بطاقة مستقلة لا يمسّها الفلتر الزمني.
 * netProfit للشهر = مبيعات مكتملة ('sale') − مشتريات تشغيلية − مصاريف تشغيلية،
 * من computeOperatingPnl الموحَّدة (LOCKED-6). العربون مستثنى (ليس ربحاً حتى
 * التسليم). شهر الشراء التشغيلي قد يظهر خسارة — وهذا صحيح: الربح تراكمي
 * ويظهر بأشهر البيع. الإضافات الرأسمالية لا تُطرح من الربح التشغيلي (تُعرض
 * سطراً منفصلاً في الميزانية).
 *
 * ملاحظة أداء (Phase 2): استبدلنا استعلام مجمَّع واحد بـ N استدعاء متتالٍ
 * لـ computeOperatingPnl (N = عدد الأشهر، افتراضياً 6). N+1 استعلام بدل 1،
 * لكنه يُوحِّد تعريف الربح مع dashboard.summary و reports.pnl فيُلغي drift.
 * مقبول للوحة من 6 أشهر — انظر SA1 NOTE + بطاقة 2.F.
 */
export async function getMonthlyProfit(months: number = 6): Promise<MonthlyProfit[]> {
  // D8 fix — Amman-anchored current month. بدون هذا، على Vercel (UTC) نحصل على
  // شهر خاطئ لمدة 3 ساعات عند كل منتصف شهر (مثلاً 21:00 UTC في 31 يناير =
  // 00:00 عمّان في 1 فبراير). الناتج `start` هو Date.UTC(year, month-1, 1)
  // (UTC midnight of 1st of current Amman month) — نطرح الأشهر منه بالـ UTC
  // getters لضمان عدم التسريب إلى server-local.
  const { start: currentStart } = getAmmanMonthBounds();

  // آخر N أشهر، الأحدث أولاً — نملأ الأشهر بالتوازي مع الحفاظ على الترتيب الدقيق
  const monthSpecs = Array.from({ length: months }, (_, i) => {
    // إنقاص i أشهر من بداية الشهر الحالي (UTC). JS يتعامل مع الشهور السالبة
    // بالالتفاف إلى السنة السابقة تلقائياً.
    const d = new Date(
      Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - i, 1),
    );
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    // بداية ونهاية الشهر بصيغة YYYY-MM-DD. نمرّرها لـ computeOperatingPnl.
    const lastDayNum = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const monthStart = `${key}-01`;
    const monthEnd = `${key}-${String(lastDayNum).padStart(2, "0")}`;
    const label = `${AR_MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return { key, label, monthStart, monthEnd };
  });

  const result: MonthlyProfit[] = await Promise.all(
    monthSpecs.map(async ({ key, label, monthStart, monthEnd }) => {
      const pnl = await computeOperatingPnl({ startDate: monthStart, endDate: monthEnd });
      return {
        month: key,
        label,
        netProfitCents: pnl.operatingNetCents,
      };
    }),
  );

  return result;
}

export type AccountBalanceItem = {
  id: string;
  name: string;
  type: string;
  balanceCents: number;
  isArchived: boolean;
};

export interface DashboardBundle {
  summary: FinancialSummary;
  summaryAllTime: FinancialSummary;
  stats: DashboardStats;
  cashSummary: CashSummary;
  accountBalances: AccountBalanceItem[];
  openingBal?: OpeningBalance | null;
  avgMonthlySpend: number;
  position?: FinancialPositionData;
  monthlyProfit: MonthlyProfit[];
  inventoryData: Awaited<ReturnType<typeof getInventoryValuation>>;
  capitalAssetsData: Awaited<ReturnType<typeof getAllCapitalAssets>>;
}

/**
 * نقطة التجميع الموحَّدة للوحة التحكم (المرحلة 3) — getDashboardBundle
 *
 * تجمع كل استعلامات لوحة التحكم في استدعاء خادم واحد عبر رحلة شبكية واحدة (1 RTT)،
 * وتُنفّذ كل الاستعلامات بالتوازي داخل الخادم عبر Promise.all.
 *
 * تحسين العمل المشترك:
 * عند اختيار المدى الافتراضي «منذ البداية» (startDate="2020-01-01" و endDate=today)،
 * يتم استدعاء getFinancialSummary مرة واحدة فقط وإعادة استخدام نتيجته لـ summaryAllTime
 * لمنع تكرار الاستعلامات.
 *
 * الأمان والنزاهة المالية:
 * أي فشل في أي استعلام يُفشِل الحزمة ككتلة واحدة (fail-fast) لحماية دقة الأرقام ومنع
 * عرض أي أرقام وهمية أو أصفار افتراضية، مما يتيح للواجهة عرض الكاش السابق مع شريط التنبيه.
 */
export async function getDashboardBundle(params: {
  startDate: string;
  endDate: string;
}): Promise<DashboardBundle> {
  const { startDate, endDate } = params;
  const today = getAmmanDate();
  const isAllTime = startDate === "2020-01-01" && endDate === today;

  // Fix connection pool exhaustion by avoiding huge Promise.all
  const summary = await getFinancialSummary(startDate, endDate);
  const summaryAllTimeRaw = isAllTime ? null : await getFinancialSummary("2020-01-01", today);
  const stats = await getDashboardStats(startDate, endDate);
  const cashSummary = await getCashSummary();
  const balancesRes = await getAccountBalances();
  const openingBalRes = await getOpeningBalance();
  const avgMonthlySpend = await getAverageMonthlySpend(3);
  const positionRes = await getFinancialPosition(endDate);
  const monthlyProfit = await getMonthlyProfit(6);
  const inventoryData = await getInventoryValuation();
  const capitalAssetsData = await getAllCapitalAssets(endDate);

  if (balancesRes.status === "error") throw new Error(balancesRes.message);
  if (openingBalRes.status === "error") throw new Error(openingBalRes.message);
  if (positionRes.status === "error") throw new Error(positionRes.message);

  const summaryAllTime = isAllTime ? summary : summaryAllTimeRaw!;

  return {
    summary,
    summaryAllTime,
    stats,
    cashSummary,
    accountBalances: balancesRes.data || [],
    openingBal: openingBalRes.data ?? null,
    avgMonthlySpend,
    position: positionRes.data ?? undefined,
    monthlyProfit,
    inventoryData,
    capitalAssetsData: capitalAssetsData || [],
  };
}
