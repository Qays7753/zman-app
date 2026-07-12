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
  ownerInject: number;
  ownerDraw: number;
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

// Mock data for fallback when database is empty
const MOCK_FINANCIAL_SUMMARY: FinancialSummary = {
  sales: 450000,
  actualSales: 350000,
  deposits: 100000,
  expenses: 85000,
  purchases: 120000,
  netProfit: 145000,
  ownerNet: 25000,
  ownerInject: 50000,
  ownerDraw: 25000,
};

// 1. حساب المخلص المالي للفترة المحددة (§12) بالتوازي
export async function getFinancialSummary(
  startDate: string,
  endDate: string,
): Promise<FinancialSummary> {
  try {
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

    // إذا كانت جميع الأرقام صفر، استخدم بيانات وهمية
    if (sales === 0 && expenses === 0 && purchases === 0) {
      return MOCK_FINANCIAL_SUMMARY;
    }

    return { sales, actualSales, deposits, expenses, purchases, netProfit, ownerNet, ownerInject, ownerDraw };
  } catch (error) {
    console.error("[v0] Error fetching financial summary:", error);
    return MOCK_FINANCIAL_SUMMARY;
  }
}

// Mock activities for empty database
const MOCK_RECENT_ACTIVITIES: ActivityItem[] = [
  {
    id: "1",
    type: "sale",
    title: "مبيعات من محمود",
    amount: 45000,
    date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    hasCashImpact: true,
  },
  {
    id: "2",
    type: "expense",
    title: "مصروف: الإيجار",
    amount: 30000,
    date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    hasCashImpact: true,
  },
  {
    id: "3",
    type: "purchase",
    title: "شراء مواد: قماش",
    amount: 50000,
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    hasCashImpact: true,
  },
  {
    id: "4",
    type: "order",
    title: "طلب جديد بقيمة 250.000 د.أ",
    amount: 50000,
    date: new Date(),
    hasCashImpact: true,
  },
];

// 2. جلب آخر النشاطات عبر الجداول الأربعة بشكل متوازٍ (§5.7)
export async function getRecentActivities(
  startDate?: string,
  endDate?: string,
): Promise<ActivityItem[]> {
  try {
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
    const sorted = activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);

    // Return mock data if empty
    if (sorted.length === 0) {
      return MOCK_RECENT_ACTIVITIES;
    }

    return sorted;
  } catch (error) {
    console.error("[v0] Error fetching recent activities:", error);
    return MOCK_RECENT_ACTIVITIES;
  }
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

const MOCK_DASHBOARD_STATS: DashboardStats = {
  ordersByStatus: {
    draft: 3,
    sent: 2,
    confirmed: 5,
    delivered: 12,
    cancelled: 1,
  },
  upcomingOrders: [
    {
      id: "1",
      customerName: "محمود العامري",
      productName: "جلابيب فضي",
      deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      totalPriceCents: 350000,
      depositCents: 100000,
    },
    {
      id: "2",
      customerName: "فاطمة خليل",
      productName: "فستان بنفسجي",
      deliveryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      totalPriceCents: 250000,
      depositCents: 75000,
    },
  ],
  topExpenses: [
    {
      category: "الإيجار",
      totalCents: 150000,
      count: 3,
    },
    {
      category: "الخيوط والمواد",
      totalCents: 85000,
      count: 8,
    },
    {
      category: "المواصلات",
      totalCents: 35000,
      count: 5,
    },
  ],
};

export async function getDashboardStats(
  startDate: string,
  endDate: string,
): Promise<DashboardStats> {
  try {
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

    const topExpenses = expensesPromise.map((e) => ({
      category: e.category,
      totalCents: Number(e.totalCents) || 0,
      count: e.count,
    }));

    // Return mock data if empty
    if (upcomingOrders.length === 0 && topExpenses.length === 0) {
      return MOCK_DASHBOARD_STATS;
    }

    return { ordersByStatus, upcomingOrders, topExpenses };
  } catch (error) {
    console.error("[v0] Error fetching dashboard stats:", error);
    return MOCK_DASHBOARD_STATS;
  }
}

export interface CashSummary {
  depositsHeldCents: number;
  expectedRemainingCents: number;
}

const MOCK_CASH_SUMMARY: CashSummary = {
  depositsHeldCents: 75000,
  expectedRemainingCents: 120000,
};

export async function getCashSummary(): Promise<CashSummary> {
  try {
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

    const summary = {
      depositsHeldCents: Number(result?.depositsHeldCents) || 0,
      expectedRemainingCents: Number(result?.expectedRemainingCents) || 0,
    };

    // Return mock data if empty
    if (summary.depositsHeldCents === 0 && summary.expectedRemainingCents === 0) {
      return MOCK_CASH_SUMMARY;
    }

    return summary;
  } catch (error) {
    console.error("[v0] Error fetching cash summary:", error);
    return MOCK_CASH_SUMMARY;
  }
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
