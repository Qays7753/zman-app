"use server";

import {
  and,
  desc,
  eq,
  isNull,
  like,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { expense, purchase, sale } from "./db";
import type { Expense, Purchase, Sale } from "./types";

export interface GetFinanceFilters {
  cursor?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface GetPurchasesFilters extends GetFinanceFilters {
  supplier?: string;
}

export interface GetExpensesFilters extends GetFinanceFilters {
  category?: string;
}

export interface GetSalesFilters extends GetFinanceFilters {
  source?: "manual" | "order";
}

// 1. استعلامات المشتريات (Purchases)
export async function getPurchases(filters: GetPurchasesFilters) {
  const limit = filters.limit ?? 10;
  const conditions: (SQL | undefined)[] = [isNull(purchase.deletedAt)];

  if (filters.startDate) {
    conditions.push(sql`${purchase.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    conditions.push(sql`${purchase.date} <= ${filters.endDate}`);
  }
  if (filters.supplier) {
    conditions.push(eq(purchase.supplier, filters.supplier));
  }
  if (filters.search) {
    conditions.push(
      or(
        like(purchase.item, `%${filters.search}%`),
        like(purchase.supplier, `%${filters.search}%`),
        like(purchase.notes, `%${filters.search}%`),
      ),
    );
  }
  if (filters.cursor) {
    conditions.push(lt(purchase.id, filters.cursor));
  }

  const items = await db
    .select({
      id: purchase.id,
      date: purchase.date,
      item: purchase.item,
      supplier: purchase.supplier,
      quantity: purchase.quantity,
      unitCostCents: purchase.unitCostCents,
      totalCents: purchase.totalCents,
      notes: purchase.notes,
      deletedAt: purchase.deletedAt,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    })
    .from(purchase)
    .where(and(...conditions))
    .orderBy(desc(purchase.date), desc(purchase.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem?.id;
  }

  return { items, nextCursor };
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  const [row] = await db
    .select()
    .from(purchase)
    .where(and(eq(purchase.id, id), isNull(purchase.deletedAt)));
  return row ?? null;
}

// 2. استعلامات المصاريف (Expenses)
export async function getExpenses(filters: GetExpensesFilters) {
  const limit = filters.limit ?? 10;
  const conditions: (SQL | undefined)[] = [isNull(expense.deletedAt)];

  if (filters.startDate) {
    conditions.push(sql`${expense.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    conditions.push(sql`${expense.date} <= ${filters.endDate}`);
  }
  if (filters.category && filters.category !== "all") {
    conditions.push(eq(expense.category, filters.category));
  }
  if (filters.search) {
    conditions.push(
      or(
        like(expense.category, `%${filters.search}%`),
        like(expense.description, `%${filters.search}%`),
      ),
    );
  }
  if (filters.cursor) {
    conditions.push(lt(expense.id, filters.cursor));
  }

  const items = await db
    .select({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      amountCents: expense.amountCents,
      description: expense.description,
      deletedAt: expense.deletedAt,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    })
    .from(expense)
    .where(and(...conditions))
    .orderBy(desc(expense.date), desc(expense.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem?.id;
  }

  return { items, nextCursor };
}

export async function getExpense(id: string): Promise<Expense | null> {
  const [row] = await db
    .select()
    .from(expense)
    .where(and(eq(expense.id, id), isNull(expense.deletedAt)));
  return row ?? null;
}

// 3. استعلامات المبيعات (Sales)
export async function getSales(filters: GetSalesFilters) {
  const limit = filters.limit ?? 10;
  const conditions: (SQL | undefined)[] = [isNull(sale.deletedAt)];

  if (filters.startDate) {
    conditions.push(sql`${sale.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    conditions.push(sql`${sale.date} <= ${filters.endDate}`);
  }
  if (filters.source) {
    conditions.push(eq(sale.source, filters.source));
  }
  if (filters.search) {
    conditions.push(like(sale.description, `%${filters.search}%`));
  }
  if (filters.cursor) {
    conditions.push(lt(sale.id, filters.cursor));
  }

  const items = await db
    .select({
      id: sale.id,
      date: sale.date,
      source: sale.source,
      orderId: sale.orderId,
      amountCents: sale.amountCents,
      description: sale.description,
      deletedAt: sale.deletedAt,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    })
    .from(sale)
    .where(and(...conditions))
    .orderBy(desc(sale.date), desc(sale.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem?.id;
  }

  return { items, nextCursor };
}

export async function getSale(id: string): Promise<Sale | null> {
  const [row] = await db
    .select()
    .from(sale)
    .where(and(eq(sale.id, id), isNull(sale.deletedAt)));
  return row ?? null;
}

// فئات المصاريف الثابتة والمعتمدة (§5.1)
export async function getExpenseCategories(): Promise<string[]> {
  return ["رواتب", "إيجار", "فواتير", "مواد خام", "تسويق", "صيانة", "أخرى"];
}
