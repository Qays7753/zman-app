"use server";

import { and, desc, isNull, sql, eq } from "drizzle-orm";
import { expense, purchase, sale, cashMovement, account } from "@/features/finance/db";
import { order } from "@/features/orders/db";
import { db } from "@/lib/db/client";

export interface FinancialSummary {
  sales: number;
  actualSales: number;
  deposits: number;
  expenses: number;
  purchases: number;
  netProfit: number;
  ownerNet: number;
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
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "sale"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const depositsPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "deposit"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const expensesPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "expense"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const purchasesPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "purchase"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const ownerInjectPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "in"),
        eq(cashMovement.sourceType, "owner_inject"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const ownerDrawPromise = db
    .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
    .from(cashMovement)
    .where(
      and(
        isNull(cashMovement.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "owner_draw"),
        sql`${cashMovement.date} >= ${startDate}`,
        sql`${cashMovement.date} <= ${endDate}`,
      ),
    );

  const [
    actualSalesResult,
    depositsResult,
    expensesResult,
    purchasesResult,
    ownerInjectResult,
    ownerDrawResult,
  ] = await Promise.all([
    actualSalesPromise,
    depositsPromise,
    expensesPromise,
    purchasesPromise,
    ownerInjectPromise,
    ownerDrawPromise,
  ]);

  const actualSales = Number(actualSalesResult[0]?.total) || 0;
  const deposits = Number(depositsResult[0]?.total) || 0;
  const sales = actualSales + deposits;
  const expenses = Number(expensesResult[0]?.total) || 0;
  const purchases = Number(purchasesResult[0]?.total) || 0;
  // Profit EXCLUDES undelivered deposits (Rule 5). 'sales' here is the liquidity
  // display number (actualSales + deposits); profit must use actualSales only.
  const netProfit = actualSales - expenses - purchases;
  const ownerInject = Number(ownerInjectResult[0]?.total) || 0;
  const ownerDraw = Number(ownerDrawResult[0]?.total) || 0;
  const ownerNet = ownerInject - ownerDraw;

  return { sales, actualSales, deposits, expenses, purchases, netProfit, ownerNet };
}

// 2. جلب آخر النشاطات عبر الجداول الأربعة بشكل متوازٍ (§5.7)
export async function getRecentActivities(
  startDate?: string,
  endDate?: string,
): Promise<ActivityItem[]> {
  const orderCond = [isNull(order.deletedAt)];
  const saleCond = [isNull(sale.deletedAt)];
  const expenseCond = [isNull(expense.deletedAt)];
  const purchaseCond = [isNull(purchase.deletedAt)];

  if (startDate) {
    orderCond.push(sql`${order.createdAt} >= ${startDate}::timestamptz`);
    saleCond.push(sql`${sale.createdAt} >= ${startDate}::timestamptz`);
    expenseCond.push(sql`${expense.createdAt} >= ${startDate}::timestamptz`);
    purchaseCond.push(sql`${purchase.createdAt} >= ${startDate}::timestamptz`);
  }
  if (endDate) {
    orderCond.push(sql`${order.createdAt} <= (${endDate}::date + INTERVAL '1 day')`);
    saleCond.push(sql`${sale.createdAt} <= (${endDate}::date + INTERVAL '1 day')`);
    expenseCond.push(sql`${expense.createdAt} <= (${endDate}::date + INTERVAL '1 day')`);
    purchaseCond.push(sql`${purchase.createdAt} <= (${endDate}::date + INTERVAL '1 day')`);
  }

  const [recentOrders, recentSales, recentExpenses, recentPurchases] =
    await Promise.all([
      db
        .select({
          id: order.id,
          customerName: order.customerName,
          totalPriceCents: order.totalPriceCents,
          depositCents: order.depositCents,
          createdAt: order.createdAt,
        })
        .from(order)
        .where(and(...orderCond))
        .orderBy(desc(order.createdAt))
        .limit(5),
      db
        .select({
          id: sale.id,
          description: sale.description,
          amountCents: sale.amountCents,
          createdAt: sale.createdAt,
        })
        .from(sale)
        .where(and(...saleCond))
        .orderBy(desc(sale.createdAt))
        .limit(5),
      db
        .select({
          id: expense.id,
          category: expense.category,
          amountCents: expense.amountCents,
          createdAt: expense.createdAt,
        })
        .from(expense)
        .where(and(...expenseCond))
        .orderBy(desc(expense.createdAt))
        .limit(5),
      db
        .select({
          id: purchase.id,
          item: purchase.item,
          totalCents: purchase.totalCents,
          createdAt: purchase.createdAt,
        })
        .from(purchase)
        .where(and(...purchaseCond))
        .orderBy(desc(purchase.createdAt))
        .limit(5),
    ]);

  // تحويل ودمج البيانات
  const activities: ActivityItem[] = [
    ...recentOrders.map((o) => ({
      id: o.id,
      type: "order" as const,
      title: `طلب جديد بقيمة ${(o.totalPriceCents / 1000).toFixed(3)} د.أ`,
      amount: o.depositCents || 0,
      hasCashImpact: (o.depositCents || 0) > 0,
      date: new Date(o.createdAt),
    })),
    ...recentSales.map((s) => ({
      id: s.id,
      type: "sale" as const,
      title: s.description || "عملية مبيعات",
      amount: s.amountCents,
      date: new Date(s.createdAt),
      hasCashImpact: true,
    })),
    ...recentExpenses.map((e) => ({
      id: e.id,
      type: "expense" as const,
      title: `مصروف: ${e.category}`,
      amount: e.amountCents,
      date: new Date(e.createdAt),
      hasCashImpact: true,
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      type: "purchase" as const,
      title: `شراء مواد: ${p.item}`,
      amount: p.totalCents,
      date: new Date(p.createdAt),
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
      .where(
        and(
          isNull(cashMovement.deletedAt),
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
      .where(
        and(
          isNull(cashMovement.deletedAt),
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
      .where(
        and(
          isNull(cashMovement.deletedAt),
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
  totalDepositsCents: number;
  topExpenses: TopExpenseCategory[];
}

export async function getDashboardStats(
  startDate: string,
  endDate: string,
): Promise<DashboardStats> {
  const [statusPromise, upcomingPromise, depositsPromise, expensesPromise] = await Promise.all([
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
          sql`${order.deliveryDate} >= CURRENT_DATE`,
          sql`${order.deliveryDate} <= CURRENT_DATE + INTERVAL '7 days'`,
        ),
      )
      .orderBy(order.deliveryDate)
      .limit(10),
    db
      .select({
        total: sql<any>`coalesce(sum(${order.depositCents}), 0)::bigint`,
      })
      .from(order)
      .where(
        and(
          isNull(order.deletedAt),
          sql`${order.status} not in ('delivered', 'cancelled')`,  // F-P1-2: match tooltip
          sql`coalesce(${order.depositDate}, ${order.receivedDate})::date >= ${startDate}::date`,  // F-P1-3: match balance sheet
          sql`coalesce(${order.depositDate}, ${order.receivedDate})::date <= ${endDate}::date`,
        ),
      ),
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
      .orderBy(desc(sql`sum(${cashMovement.amountCents})`))
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

  const totalDepositsCents = Number(depositsPromise[0]?.total) || 0;

  const topExpenses = expensesPromise.map((e) => ({
    category: e.category,
    totalCents: Number(e.totalCents) || 0,
    count: e.count,
  }));

  return { ordersByStatus, upcomingOrders, totalDepositsCents, topExpenses };
}

export interface CashSummary {
  depositsHeldCents: number;
  expectedRemainingCents: number;
}

export async function getCashSummary(): Promise<CashSummary> {
  const [result] = await db
    .select({
      depositsHeldCents: sql<any>`coalesce(sum(${order.depositCents}), 0)::bigint`,
      expectedRemainingCents: sql<any>`coalesce(sum(${order.totalPriceCents} - ${order.depositCents}), 0)::bigint`,
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

export async function getCurrentMonthNet(): Promise<number> {
  const baseConds = [
    isNull(cashMovement.deletedAt),
    isNull(account.deletedAt),
    sql`${cashMovement.date} >= date_trunc('month', CURRENT_DATE)::date`,
    sql`${cashMovement.date} <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::date`
  ];

  const [[salesRes], [purchasesRes], [expensesRes]] = await Promise.all([
    db
      .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "in"),
          eq(cashMovement.sourceType, "sale")
        )
      ),
    db
      .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "purchase")
        )
      ),
    db
      .select({ total: sql<any>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint` })
      .from(cashMovement)
      .innerJoin(account, eq(cashMovement.accountId, account.id))
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "expense")
        )
      ),
  ]);

  const salesCents = Number(salesRes?.total) || 0;
  const purchasesCents = Number(purchasesRes?.total) || 0;
  const expensesCents = Number(expensesRes?.total) || 0;
  return salesCents - purchasesCents - expensesCents;
}
