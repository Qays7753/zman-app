"use server";

import {
  and,
  desc,
  eq,
  isNull,
  like,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { expense, purchase, sale } from "./db";
import type { Expense, Purchase, Sale } from "./types";
import { order } from "@/features/orders/db";
// D7 fix — capital_asset لإظهار زر «إيقاف الإهلاك» على الصفوف التي لها أصل نشط.
import { capitalAsset } from "../depreciation/db";

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

export type PaymentKind = "expense" | "purchase";

export interface GetPaymentsFilters extends GetFinanceFilters {
  filter?: "all" | "expense" | "purchase" | "asset";
  category?: string;
  nature?: string;
}

export interface PaymentItem {
  id: string;
  kind: PaymentKind;
  date: string;
  title: string;
  amountCents: number;
  category: string | null;
  description: string | null;
  supplier: string | null;
  quantity: number | null;
  unitCostCents: number | null;
  notes: string | null;
  isCapitalAsset: boolean;
  costNature: string | null;
  isInventoryWriteoff: boolean;
  activeCapitalAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * 0. استعلام المدفوعات الموحَّد (Payments: Expenses + Purchases)
 * يدعم فلترة الرقاقات: الكل · مصاريف · مشتريات · أصول
 */
export async function getPayments(filters: GetPaymentsFilters): Promise<{ items: PaymentItem[]; nextCursor?: string }> {
  const limit = filters.limit ?? 10;
  const activeTabFilter = filters.filter || "all";

  // Expense conditions
  const expenseConds: (SQL | undefined)[] = [isNull(expense.deletedAt)];
  if (filters.startDate) {
    expenseConds.push(sql`${expense.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    expenseConds.push(sql`${expense.date} <= ${filters.endDate}`);
  }
  if (filters.category && filters.category !== "all" && filters.category !== "الكل") {
    expenseConds.push(eq(expense.category, filters.category));
  }
  if (filters.search) {
    expenseConds.push(
      or(
        like(expense.category, `%${filters.search}%`),
        like(expense.description, `%${filters.search}%`),
      ),
    );
  }
  if (filters.nature) {
    if (filters.nature === "capital") {
      expenseConds.push(eq(expense.isCapitalAsset, true));
    } else if (filters.nature === "fixed") {
      expenseConds.push(and(eq(expense.isCapitalAsset, false), eq(expense.costNature, "fixed")));
    } else if (filters.nature === "variable") {
      expenseConds.push(and(eq(expense.isCapitalAsset, false), or(eq(expense.costNature, "variable"), isNull(expense.costNature))));
    }
  }
  if (activeTabFilter === "expense") {
    expenseConds.push(eq(expense.isCapitalAsset, false));
  } else if (activeTabFilter === "asset") {
    expenseConds.push(eq(expense.isCapitalAsset, true));
  }

  // Purchase conditions
  const purchaseConds: (SQL | undefined)[] = [isNull(purchase.deletedAt)];
  if (filters.startDate) {
    purchaseConds.push(sql`${purchase.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    purchaseConds.push(sql`${purchase.date} <= ${filters.endDate}`);
  }
  if (filters.search) {
    purchaseConds.push(
      or(
        like(purchase.item, `%${filters.search}%`),
        like(purchase.supplier, `%${filters.search}%`),
        like(purchase.notes, `%${filters.search}%`),
      ),
    );
  }
  if (filters.nature) {
    if (filters.nature === "capital") {
      purchaseConds.push(eq(purchase.isCapitalAsset, true));
    } else if (filters.nature === "fixed") {
      purchaseConds.push(and(eq(purchase.isCapitalAsset, false), eq(purchase.costNature, "fixed")));
    } else if (filters.nature === "variable") {
      purchaseConds.push(and(eq(purchase.isCapitalAsset, false), or(eq(purchase.costNature, "variable"), isNull(purchase.costNature))));
    }
  }
  if (activeTabFilter === "purchase") {
    purchaseConds.push(eq(purchase.isCapitalAsset, false));
  } else if (activeTabFilter === "asset") {
    purchaseConds.push(eq(purchase.isCapitalAsset, true));
  }

  // Cursor handling
  if (filters.cursor) {
    const [cursorTime, cursorId] = filters.cursor.split("|");
    expenseConds.push(
      sql`(${expense.createdAt}, ${expense.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
    purchaseConds.push(
      sql`(${purchase.createdAt}, ${purchase.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
  }

  // If filter is strictly "expense", query expense table only
  if (activeTabFilter === "expense") {
    const rows = await db
      .select({
        id: expense.id,
        date: expense.date,
        title: sql<string>`coalesce(nullif(${expense.description}, ''), ${expense.category})`,
        amountCents: expense.amountCents,
        category: expense.category,
        description: expense.description,
        supplier: sql<string | null>`null`,
        quantity: sql<number | null>`null`,
        unitCostCents: sql<number | null>`null`,
        notes: sql<string | null>`null`,
        isCapitalAsset: expense.isCapitalAsset,
        costNature: expense.costNature,
        isInventoryWriteoff: expense.isInventoryWriteoff,
        createdAt: expense.createdAt,
        updatedAt: expense.updatedAt,
        deletedAt: expense.deletedAt,
        activeCapitalAssetId: sql<string | null>`(
          select ${capitalAsset.id} from ${capitalAsset}
          where ${capitalAsset.sourceType} = 'expense'
            and ${capitalAsset.sourceId} = ${expense.id}
            and ${capitalAsset.deletedAt} is null
          limit 1
        )`,
      })
      .from(expense)
      .where(and(...expenseConds))
      .orderBy(desc(expense.createdAt), desc(expense.id))
      .limit(limit + 1);

    const items: PaymentItem[] = rows.map((r) => ({
      ...r,
      kind: "expense" as const,
    }));

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem
        ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
        : undefined;
    }
    return { items, nextCursor };
  }

  // If filter is strictly "purchase", query purchase table only
  if (activeTabFilter === "purchase") {
    const rows = await db
      .select({
        id: purchase.id,
        date: purchase.date,
        title: purchase.item,
        amountCents: purchase.totalCents,
        category: sql<string | null>`null`,
        description: sql<string | null>`null`,
        supplier: purchase.supplier,
        quantity: purchase.quantity,
        unitCostCents: purchase.unitCostCents,
        notes: purchase.notes,
        isCapitalAsset: purchase.isCapitalAsset,
        costNature: purchase.costNature,
        isInventoryWriteoff: sql<boolean>`false`,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt,
        deletedAt: purchase.deletedAt,
        activeCapitalAssetId: sql<string | null>`(
          select ${capitalAsset.id} from ${capitalAsset}
          where ${capitalAsset.sourceType} = 'purchase'
            and ${capitalAsset.sourceId} = ${purchase.id}
            and ${capitalAsset.deletedAt} is null
          limit 1
        )`,
      })
      .from(purchase)
      .where(and(...purchaseConds))
      .orderBy(desc(purchase.createdAt), desc(purchase.id))
      .limit(limit + 1);

    const items: PaymentItem[] = rows.map((r) => ({
      ...r,
      kind: "purchase" as const,
    }));

    let nextCursor: string | undefined;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem
        ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
        : undefined;
    }
    return { items, nextCursor };
  }



  // Otherwise ("all" or "asset"), UNION ALL both tables
  const expenseQuery = db
    .select({
      id: expense.id,
      kind: sql<string>`'expense'`,
      date: expense.date,
      title: sql<string>`coalesce(nullif(${expense.description}, ''), ${expense.category})`,
      amountCents: expense.amountCents,
      category: sql<string | null>`${expense.category}`,
      description: sql<string | null>`${expense.description}`,
      supplier: sql<string | null>`null`,
      quantity: sql<number | null>`null`,
      unitCostCents: sql<number | null>`null`,
      notes: sql<string | null>`null`,
      isCapitalAsset: expense.isCapitalAsset,
      costNature: sql<string | null>`${expense.costNature}`,
      isInventoryWriteoff: sql<boolean>`${expense.isInventoryWriteoff}`,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      deletedAt: sql<Date | null>`${expense.deletedAt}`,
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'expense'
          and ${capitalAsset.sourceId} = ${expense.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`,
    })
    .from(expense)
    .where(and(...expenseConds));

  const purchaseQuery = db
    .select({
      id: purchase.id,
      kind: sql<string>`'purchase'`,
      date: purchase.date,
      title: purchase.item,
      amountCents: purchase.totalCents,
      category: sql<string | null>`null`,
      description: sql<string | null>`null`,
      supplier: sql<string | null>`${purchase.supplier}`,
      quantity: sql<number | null>`${purchase.quantity}`,
      unitCostCents: sql<number | null>`${purchase.unitCostCents}`,
      notes: sql<string | null>`${purchase.notes}`,
      isCapitalAsset: purchase.isCapitalAsset,
      costNature: sql<string | null>`${purchase.costNature}`,
      isInventoryWriteoff: sql<boolean>`false`,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
      deletedAt: sql<Date | null>`${purchase.deletedAt}`,
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'purchase'
          and ${capitalAsset.sourceId} = ${purchase.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`,
    })
    .from(purchase)
    .where(and(...purchaseConds));

  const unionQuery = unionAll(expenseQuery, purchaseQuery);
  const rows = await db
    .select()
    .from(unionQuery.as("unified_payments"))
    .orderBy(desc(sql`created_at`), desc(sql`id`))
    .limit(limit + 1);

  const items: PaymentItem[] = rows.map((r: any) => ({
    id: r.id,
    kind: r.kind as PaymentKind,
    date: r.date,
    title: r.title,
    amountCents: Number(r.amountCents ?? r.amount_cents),
    category: r.category,
    description: r.description,
    supplier: r.supplier,
    quantity: r.quantity !== null && r.quantity !== undefined ? Number(r.quantity) : null,
    unitCostCents: r.unitCostCents !== null && r.unitCostCents !== undefined ? Number(r.unitCostCents ?? r.unit_cost_cents) : null,
    notes: r.notes,
    isCapitalAsset: Boolean(r.isCapitalAsset ?? r.is_capital_asset),
    costNature: r.costNature ?? r.cost_nature,
    isInventoryWriteoff: Boolean(r.isInventoryWriteoff ?? r.is_inventory_writeoff),
    activeCapitalAssetId: r.activeCapitalAssetId ?? r.active_capital_asset_id,
    createdAt: new Date(r.createdAt ?? r.created_at),
    updatedAt: new Date(r.updatedAt ?? r.updated_at),
    deletedAt: (r.deletedAt ?? r.deleted_at) ? new Date(r.deletedAt ?? r.deleted_at) : null,
  }));

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem
      ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
      : undefined;
  }

  return { items, nextCursor };
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
  // الترتيب حسب وقت الإنشاء الفعلي (created_at) لا تاريخ الفاتورة، والـ cursor
  // ثنائي (created_at, id) ليطابق الترتيب ويمنع تخطّي/تكرار الصفوف
  if (filters.cursor) {
    const [cursorTime, cursorId] = filters.cursor.split("|");
    conditions.push(
      sql`(${purchase.createdAt}, ${purchase.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
  }

  const items = await db
    .select({
      id: purchase.id,
      date: purchase.date,
      item: purchase.item,
      supplier: purchase.supplier,
      quantity: purchase.quantity,
      unitCostCents: purchase.unitCostCents,
      unitCostMicroCents: purchase.unitCostMicroCents,
      totalCents: purchase.totalCents,
      notes: purchase.notes,
      // Phase 2 — حقلا التصنيف لعرض الشارة في PurchasesTab.
      isCapitalAsset: purchase.isCapitalAsset,
      costNature: purchase.costNature,
      deletedAt: purchase.deletedAt,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
      // D7 fix — معرّف capital_asset النشط المرتبط (إن وُجد)، لعرض زر «إيقاف
      // الإهلاك» في PurchasesTab. scalar subquery بدل LEFT JOIN لأننا نحتاج
      // المعرّف فقط لا بقية الأعمدة، ولا نريد تغيير cardinality النتائج.
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'purchase'
          and ${capitalAsset.sourceId} = ${purchase.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`,
    })
    .from(purchase)
    .where(and(...conditions))
    .orderBy(desc(purchase.createdAt), desc(purchase.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem
      ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
      : undefined;
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
    const [cursorTime, cursorId] = filters.cursor.split("|");
    conditions.push(
      sql`(${expense.createdAt}, ${expense.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
  }

  const items = await db
    .select({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      amountCents: expense.amountCents,
      description: expense.description,
      // Phase 2 — حقلا التصنيف لعرض الشارة في ExpensesTab.
      isCapitalAsset: expense.isCapitalAsset,
      costNature: expense.costNature,
      // SA-B (R5-3) — اعرض علم «هدر/تلف مخزون» ليجعل الصف للقراءة فقط في
      // ExpensesTab ويُحرس deleteExpense/updateExpense. قبل هذا الإصلاح كان
      // الحقل موجوداً في الجدول لكنه غير معرَّض هنا، فلم تستطع الواجهة أو
      // الإجراءات تمييز صفوف التسوية المُشتقّة.
      isInventoryWriteoff: expense.isInventoryWriteoff,
      deletedAt: expense.deletedAt,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      // D7 fix — معرّف capital_asset النشط المرتبط (إن وُجد)، لعرض زر «إيقاف
      // الإهلاك» في ExpensesTab.
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'expense'
          and ${capitalAsset.sourceId} = ${expense.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`,
    })
    .from(expense)
    .where(and(...conditions))
    .orderBy(desc(expense.createdAt), desc(expense.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem
      ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
      : undefined;
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
    const [cursorTime, cursorId] = filters.cursor.split("|");
    conditions.push(
      sql`(${sale.createdAt}, ${sale.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
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
      depositCents: order.depositCents,
    })
    .from(sale)
    .leftJoin(order, eq(sale.orderId, order.id))
    .where(and(...conditions))
    .orderBy(desc(sale.createdAt), desc(sale.id))
    .limit(limit + 1);

  let nextCursor: string | undefined;
  if (items.length > limit) {
    const nextItem = items.pop();
    nextCursor = nextItem
      ? `${new Date(nextItem.createdAt).toISOString()}|${nextItem.id}`
      : undefined;
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
