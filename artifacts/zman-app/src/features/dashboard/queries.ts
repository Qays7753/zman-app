"use server";

import { and, desc, isNull, sql } from "drizzle-orm";
import { expense, purchase, sale } from "@/features/finance/db";
import { order } from "@/features/orders/db";
import { db } from "@/lib/db/client";

export interface FinancialSummary {
  sales: number;
  expenses: number;
  purchases: number;
  netProfit: number;
}

export interface ActivityItem {
  id: string;
  type: "order" | "sale" | "expense" | "purchase";
  title: string;
  amount: number;
  date: Date;
  metadata?: string;
}

// 1. حساب المخلص المالي للفترة المحددة (§12) بالتوازي
export async function getFinancialSummary(
  startDate: string,
  endDate: string,
): Promise<FinancialSummary> {
  const [salesPromise, expensesPromise, purchasesPromise] = await Promise.all([
    db
      .select({
        total: sql<any>`coalesce(sum(${sale.amountCents}), 0)::bigint`,
      })
      .from(sale)
      .where(
        and(
          isNull(sale.deletedAt),
          sql`${sale.date} >= ${startDate}`,
          sql`${sale.date} <= ${endDate}`,
        ),
      ),
    db
      .select({
        total: sql<any>`coalesce(sum(${expense.amountCents}), 0)::bigint`,
      })
      .from(expense)
      .where(
        and(
          isNull(expense.deletedAt),
          sql`${expense.date} >= ${startDate}`,
          sql`${expense.date} <= ${endDate}`,
        ),
      ),
    db
      .select({
        total: sql<any>`coalesce(sum(${purchase.totalCents}), 0)::bigint`,
      })
      .from(purchase)
      .where(
        and(
          isNull(purchase.deletedAt),
          sql`${purchase.date} >= ${startDate}`,
          sql`${purchase.date} <= ${endDate}`,
        ),
      ),
  ]);

  const [salesResult] = salesPromise;
  const [expensesResult] = expensesPromise;
  const [purchasesResult] = purchasesPromise;

  const sales = Number(salesResult?.total) || 0;
  const expenses = Number(expensesResult?.total) || 0;
  const purchases = Number(purchasesResult?.total) || 0;
  const netProfit = sales - expenses - purchases;

  return { sales, expenses, purchases, netProfit };
}

// 2. جلب آخر النشاطات عبر الجداول الأربعة بشكل متوازٍ (§5.7)
export async function getRecentActivities(): Promise<ActivityItem[]> {
  const [recentOrders, recentSales, recentExpenses, recentPurchases] =
    await Promise.all([
      db
        .select({
          id: order.id,
          customerName: order.customerName,
          totalPriceCents: order.totalPriceCents,
          createdAt: order.createdAt,
        })
        .from(order)
        .where(isNull(order.deletedAt))
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
        .where(isNull(sale.deletedAt))
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
        .where(isNull(expense.deletedAt))
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
        .where(isNull(purchase.deletedAt))
        .orderBy(desc(purchase.createdAt))
        .limit(5),
    ]);

  // تحويل ودمج البيانات
  const activities: ActivityItem[] = [
    ...recentOrders.map((o) => ({
      id: o.id,
      type: "order" as const,
      title: "طلب جديد",
      amount: o.totalPriceCents,
      date: new Date(o.createdAt),
    })),
    ...recentSales.map((s) => ({
      id: s.id,
      type: "sale" as const,
      title: s.description || "عملية مبيعات",
      amount: s.amountCents,
      date: new Date(s.createdAt),
    })),
    ...recentExpenses.map((e) => ({
      id: e.id,
      type: "expense" as const,
      title: `مصروف: ${e.category}`,
      amount: e.amountCents,
      date: new Date(e.createdAt),
    })),
    ...recentPurchases.map((p) => ({
      id: p.id,
      type: "purchase" as const,
      title: `شراء مواد: ${p.item}`,
      amount: p.totalCents,
      date: new Date(p.createdAt),
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
        day: sale.date,
        total: sql<any>`sum(${sale.amountCents})::bigint`,
      })
      .from(sale)
      .where(
        and(
          isNull(sale.deletedAt),
          sql`${sale.date} >= ${startDate}`,
          sql`${sale.date} <= ${endDate}`,
        ),
      )
      .groupBy(sale.date),
    db
      .select({
        day: expense.date,
        total: sql<any>`sum(${expense.amountCents})::bigint`,
      })
      .from(expense)
      .where(
        and(
          isNull(expense.deletedAt),
          sql`${expense.date} >= ${startDate}`,
          sql`${expense.date} <= ${endDate}`,
        ),
      )
      .groupBy(expense.date),
    db
      .select({
        day: purchase.date,
        total: sql<any>`sum(${purchase.totalCents})::bigint`,
      })
      .from(purchase)
      .where(
        and(
          isNull(purchase.deletedAt),
          sql`${purchase.date} >= ${startDate}`,
          sql`${purchase.date} <= ${endDate}`,
        ),
      )
      .groupBy(purchase.date),
  ]);

  return {
    salesTrend: salesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
    expensesTrend: expensesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
    purchasesTrend: purchasesTrend.map((t) => ({ day: t.day, total: Number(t.total) || 0 })),
  };
}

export interface UpcomingOrder {
  id: string;
  customerName: string;
  productName: string;
  deliveryDate: string | null;
  totalPriceCents: number;
}

export interface DashboardStats {
  ordersByStatus: Record<string, number>;
  upcomingOrders: UpcomingOrder[];
  totalDepositsCents: number;
}

export async function getDashboardStats(
  startDate: string,
  endDate: string,
): Promise<DashboardStats> {
  const [statusPromise, upcomingPromise, depositsPromise] = await Promise.all([
    db
      .select({
        status: order.status,
        count: sql<number>`count(${order.id})::int`,
      })
      .from(order)
      .where(isNull(order.deletedAt))
      .groupBy(order.status),
    db
      .select({
        id: order.id,
        customerName: order.customerName,
        productName: order.productName,
        deliveryDate: sql<string>`TO_CHAR(${order.deliveryDate}::date, 'YYYY-MM-DD')`,
        totalPriceCents: order.totalPriceCents,
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
          sql`${order.status} <> 'cancelled'`,
          sql`coalesce(${order.depositDate}, ${order.createdAt})::date >= ${startDate}::date`,
          sql`coalesce(${order.depositDate}, ${order.createdAt})::date <= ${endDate}::date`,
        ),
      ),
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
  }));

  const totalDepositsCents = Number(depositsPromise[0]?.total) || 0;

  return { ordersByStatus, upcomingOrders, totalDepositsCents };
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
