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
import { expense, purchase, sale, receivable, receivablePayment, account } from "./db";
import type { Expense, Purchase, Sale, Receivable, ReceivablePayment, ReceivableWithPayments } from "./types";
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

export type PaymentKind = "expense" | "purchase" | "receivable";

export interface GetPaymentsFilters extends GetFinanceFilters {
  filter?: "all" | "expense" | "purchase" | "asset" | "receivable";
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
  personName?: string | null;
  paidAmountCents?: number | null;
  remainingCents?: number | null;
  debtStatus?: "open" | "paid" | null;
  accountId?: string | null;
  accountName?: string | null;
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

  // Receivable conditions
  const receivableConds: (SQL | undefined)[] = [isNull(receivable.deletedAt)];
  if (filters.startDate) {
    receivableConds.push(sql`${receivable.date} >= ${filters.startDate}`);
  }
  if (filters.endDate) {
    receivableConds.push(sql`${receivable.date} <= ${filters.endDate}`);
  }
  if (filters.search) {
    receivableConds.push(
      or(
        like(receivable.personName, `%${filters.search}%`),
        like(receivable.notes, `%${filters.search}%`),
      ),
    );
  }

  // Cursor handling
  if (filters.cursor) {
    const [cursorTime, cursorId] = filters.cursor.split("|");
    // الفاصل (created_at, id) تنازلياً — مطابق لنمط getExpenses/getPurchases.
    expenseConds.push(
      sql`(${expense.createdAt}, ${expense.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
    purchaseConds.push(
      sql`(${purchase.createdAt}, ${purchase.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
    receivableConds.push(
      sql`(${receivable.createdAt}, ${receivable.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
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
      items.pop(); // الصفّ الزائد — دليل وجود صفحة تالية فقط
      const lastItem = items[items.length - 1];
      nextCursor = lastItem
        ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
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
      items.pop(); // الصفّ الزائد — دليل وجود صفحة تالية فقط
      const lastItem = items[items.length - 1];
      nextCursor = lastItem
        ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
        : undefined;
    }
    return { items, nextCursor };
  }

  // If filter is strictly "receivable", query receivable table only
  if (activeTabFilter === "receivable") {
    const rows = await db
      .select({
        id: receivable.id,
        date: receivable.date,
        title: receivable.personName,
        amountCents: receivable.amountCents,
        category: sql<string | null>`'دَين لشخص'`,
        description: receivable.notes,
        supplier: sql<string | null>`null`,
        quantity: sql<number | null>`null`,
        unitCostCents: sql<number | null>`null`,
        notes: receivable.notes,
        isCapitalAsset: sql<boolean>`false`,
        costNature: sql<string | null>`null`,
        isInventoryWriteoff: sql<boolean>`false`,
        activeCapitalAssetId: sql<string | null>`null`,
        personName: receivable.personName,
        accountId: receivable.accountId,
        accountName: account.name,
        paidAmountCents: sql<number>`coalesce((
          select sum(${receivablePayment.amountCents})
          from ${receivablePayment}
          where ${receivablePayment.receivableId} = ${receivable.id}
            and ${receivablePayment.deletedAt} is null
        ), 0)`,
        createdAt: receivable.createdAt,
        updatedAt: receivable.updatedAt,
        deletedAt: receivable.deletedAt,
      })
      .from(receivable)
      .leftJoin(account, eq(receivable.accountId, account.id))
      .where(and(...receivableConds))
      .orderBy(desc(receivable.createdAt), desc(receivable.id))
      .limit(limit + 1);

    const items: PaymentItem[] = rows.map((r) => {
      const paid = Number(r.paidAmountCents) || 0;
      const remaining = Math.max(0, r.amountCents - paid);
      return {
        ...r,
        kind: "receivable" as const,
        paidAmountCents: paid,
        remainingCents: remaining,
        debtStatus: remaining <= 0 ? ("paid" as const) : ("open" as const),
      };
    });

    let nextCursor: string | undefined;
    if (items.length > limit) {
      items.pop();
      const lastItem = items[items.length - 1];
      nextCursor = lastItem
        ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
        : undefined;
    }
    return { items, nextCursor };
  }

  // Otherwise ("all" or "asset"), UNION ALL tables
  const expenseQuery = db
    .select({
      id: expense.id,
      kind: sql<string>`'expense'`.as("kind"),
      date: expense.date,
      title: sql<string>`coalesce(nullif(${expense.description}, ''), ${expense.category})`.as("title"),
      amountCents: expense.amountCents,
      category: sql<string | null>`${expense.category}`.as("category"),
      description: sql<string | null>`${expense.description}`.as("description"),
      supplier: sql<string | null>`null::text`.as("supplier"),
      quantity: sql<number | null>`null::integer`.as("quantity"),
      unitCostCents: sql<number | null>`null::integer`.as("unit_cost_cents"),
      notes: sql<string | null>`null::text`.as("notes"),
      isCapitalAsset: expense.isCapitalAsset,
      costNature: sql<string | null>`${expense.costNature}`.as("cost_nature"),
      isInventoryWriteoff: sql<boolean>`${expense.isInventoryWriteoff}`.as("is_inventory_writeoff"),
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
      deletedAt: sql<Date | null>`${expense.deletedAt}`.as("deleted_at"),
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'expense'
          and ${capitalAsset.sourceId} = ${expense.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`.as("active_capital_asset_id"),
      personName: sql<string | null>`null::text`.as("person_name"),
      accountId: sql<string | null>`null::uuid`.as("account_id"),
      paidAmountCents: sql<number | null>`null::integer`.as("paid_amount_cents"),
    })
    .from(expense)
    .where(and(...expenseConds));

  const purchaseQuery = db
    .select({
      id: purchase.id,
      kind: sql<string>`'purchase'`.as("kind"),
      date: purchase.date,
      title: sql<string>`${purchase.item}`.as("title"),
      amountCents: purchase.totalCents,
      category: sql<string | null>`null::text`.as("category"),
      description: sql<string | null>`null::text`.as("description"),
      supplier: sql<string | null>`${purchase.supplier}`.as("supplier"),
      quantity: sql<number | null>`${purchase.quantity}`.as("quantity"),
      unitCostCents: sql<number | null>`${purchase.unitCostCents}`.as("unit_cost_cents"),
      notes: sql<string | null>`${purchase.notes}`.as("notes"),
      isCapitalAsset: purchase.isCapitalAsset,
      costNature: sql<string | null>`${purchase.costNature}`.as("cost_nature"),
      isInventoryWriteoff: sql<boolean>`false`.as("is_inventory_writeoff"),
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
      deletedAt: sql<Date | null>`${purchase.deletedAt}`.as("deleted_at"),
      activeCapitalAssetId: sql<string | null>`(
        select ${capitalAsset.id} from ${capitalAsset}
        where ${capitalAsset.sourceType} = 'purchase'
          and ${capitalAsset.sourceId} = ${purchase.id}
          and ${capitalAsset.deletedAt} is null
        limit 1
      )`.as("active_capital_asset_id"),
      personName: sql<string | null>`null::text`.as("person_name"),
      accountId: sql<string | null>`null::uuid`.as("account_id"),
      paidAmountCents: sql<number | null>`null::integer`.as("paid_amount_cents"),
    })
    .from(purchase)
    .where(and(...purchaseConds));

  const receivableQuery = db
    .select({
      id: receivable.id,
      kind: sql<string>`'receivable'`.as("kind"),
      date: receivable.date,
      title: sql<string>`${receivable.personName}`.as("title"),
      amountCents: receivable.amountCents,
      category: sql<string | null>`'دَين لشخص'::text`.as("category"),
      description: sql<string | null>`${receivable.notes}`.as("description"),
      supplier: sql<string | null>`null::text`.as("supplier"),
      quantity: sql<number | null>`null::integer`.as("quantity"),
      unitCostCents: sql<number | null>`null::integer`.as("unit_cost_cents"),
      notes: sql<string | null>`${receivable.notes}`.as("notes"),
      isCapitalAsset: sql<boolean>`false`.as("is_capital_asset"),
      costNature: sql<string | null>`null::text`.as("cost_nature"),
      isInventoryWriteoff: sql<boolean>`false`.as("is_inventory_writeoff"),
      createdAt: receivable.createdAt,
      updatedAt: receivable.updatedAt,
      deletedAt: sql<Date | null>`${receivable.deletedAt}`.as("deleted_at"),
      activeCapitalAssetId: sql<string | null>`null::uuid`.as("active_capital_asset_id"),
      personName: sql<string | null>`${receivable.personName}`.as("person_name"),
      accountId: sql<string | null>`${receivable.accountId}`.as("account_id"),
      paidAmountCents: sql<number | null>`(
        select coalesce(sum(${receivablePayment.amountCents}), 0)::integer
        from ${receivablePayment}
        where ${receivablePayment.receivableId} = ${receivable.id}
          and ${receivablePayment.deletedAt} is null
      )`.as("paid_amount_cents"),
    })
    .from(receivable)
    .where(and(...receivableConds));

  const unionQuery =
    activeTabFilter === "asset"
      ? unionAll(expenseQuery, purchaseQuery)
      : unionAll(expenseQuery, purchaseQuery, receivableQuery);

  const rows = await db
    .select()
    .from(unionQuery.as("unified_payments"))
    // مؤهَّل باسم الجدول الفرعي — `id` وحده ملتبس داخل UNION فيفشل الاستعلام.
    .orderBy(desc(sql`unified_payments.created_at`), desc(sql`unified_payments.id`))
    .limit(limit + 1);

  const items: PaymentItem[] = rows.map((r: any) => {
    const paid = r.paidAmountCents != null ? Number(r.paidAmountCents) : null;
    const remaining =
      r.kind === "receivable" && paid != null
        ? Math.max(0, Number(r.amountCents) - paid)
        : null;
    const debtStatus =
      r.kind === "receivable"
        ? remaining != null && remaining <= 0
          ? ("paid" as const)
          : ("open" as const)
        : null;

    return {
      id: r.id,
      kind: r.kind as PaymentKind,
      date: r.date,
      title: r.title,
      amountCents: Number(r.amountCents),
      category: r.category,
      description: r.description,
      supplier: r.supplier,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unitCostCents: r.unitCostCents != null ? Number(r.unitCostCents) : null,
      notes: r.notes,
      isCapitalAsset: Boolean(r.isCapitalAsset),
      costNature: r.costNature,
      isInventoryWriteoff: Boolean(r.isInventoryWriteoff),
      activeCapitalAssetId: r.activeCapitalAssetId,
      personName: r.personName,
      paidAmountCents: paid,
      remainingCents: remaining,
      debtStatus,
      accountId: r.accountId,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
      deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
    };
  });

  // 🔴 الـ cursor يُشتقّ من **آخر صفّ مُعاد فعلاً**، لا من الصفّ الزائد المحذوف.
  // الشرط في الصفحة التالية `<` حصري، فاشتقاقه من الصفّ المحذوف يُسقطه نهائياً —
  // صفّ ضائع مع كل صفحة (فُقد 10 صفوف من 41 عبر 10 صفحات في اختبار فعلي).
  let nextCursor: string | undefined;
  if (items.length > limit) {
    items.pop(); // الصفّ الزائد (limit + 1) — دليل وجود صفحة تالية فقط
    const lastItem = items[items.length - 1];
    nextCursor = lastItem
      ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
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
    items.pop(); // الصفّ الزائد — دليل وجود صفحة تالية فقط
    const lastItem = items[items.length - 1];
    nextCursor = lastItem
      ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
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
    items.pop(); // الصفّ الزائد — دليل وجود صفحة تالية فقط
    const lastItem = items[items.length - 1];
    nextCursor = lastItem
      ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
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
    items.pop(); // الصفّ الزائد — دليل وجود صفحة تالية فقط
    const lastItem = items[items.length - 1];
    nextCursor = lastItem
      ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
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

// 4. استعلامات الذمم المدينة (Receivables)
export async function getReceivables(filters?: {
  search?: string;
  status?: "all" | "open" | "paid";
  startDate?: string;
  endDate?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: ReceivableWithPayments[]; nextCursor?: string }> {
  const limit = filters?.limit ?? 50;
  const conds: (SQL | undefined)[] = [isNull(receivable.deletedAt)];

  if (filters?.startDate) {
    conds.push(sql`${receivable.date} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conds.push(sql`${receivable.date} <= ${filters.endDate}`);
  }
  if (filters?.search) {
    conds.push(
      or(
        like(receivable.personName, `%${filters.search}%`),
        like(receivable.notes, `%${filters.search}%`),
      ),
    );
  }
  if (filters?.cursor) {
    const [cursorTime, cursorId] = filters.cursor.split("|");
    conds.push(
      sql`(${receivable.createdAt}, ${receivable.id}) < (${cursorTime}::timestamptz, ${cursorId})`,
    );
  }

  const rows = await db
    .select({
      id: receivable.id,
      date: receivable.date,
      personName: receivable.personName,
      amountCents: receivable.amountCents,
      accountId: receivable.accountId,
      notes: receivable.notes,
      deletedAt: receivable.deletedAt,
      createdAt: receivable.createdAt,
      updatedAt: receivable.updatedAt,
    })
    .from(receivable)
    .where(and(...conds))
    .orderBy(desc(receivable.createdAt), desc(receivable.id))
    .limit(limit + 1);

  const recIds = rows.map((r) => r.id);
  const payments =
    recIds.length > 0
      ? await db
          .select({
            id: receivablePayment.id,
            receivableId: receivablePayment.receivableId,
            date: receivablePayment.date,
            amountCents: receivablePayment.amountCents,
            accountId: receivablePayment.accountId,
            accountName: account.name,
            notes: receivablePayment.notes,
            deletedAt: receivablePayment.deletedAt,
            createdAt: receivablePayment.createdAt,
            updatedAt: receivablePayment.updatedAt,
          })
          .from(receivablePayment)
          .leftJoin(account, eq(receivablePayment.accountId, account.id))
          .where(
            and(
              sql`${receivablePayment.receivableId} in (${sql.join(recIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
              isNull(receivablePayment.deletedAt),
            ),
          )
          .orderBy(desc(receivablePayment.date), desc(receivablePayment.createdAt))
      : [];

  const paymentsByRecId: Record<string, typeof payments> = {};
  for (const p of payments) {
    if (!paymentsByRecId[p.receivableId]) {
      paymentsByRecId[p.receivableId] = [];
    }
    paymentsByRecId[p.receivableId].push(p);
  }

  let items: ReceivableWithPayments[] = rows.map((r) => {
    const pList = (paymentsByRecId[r.id] || []).map((p) => ({
      ...p,
      accountName: p.accountName ?? undefined,
    }));
    const paidAmountCents = pList.reduce((acc, p) => acc + p.amountCents, 0);
    const remainingCents = Math.max(0, r.amountCents - paidAmountCents);
    const status: "open" | "paid" = remainingCents <= 0 ? "paid" : "open";
    return {
      ...r,
      paidAmountCents,
      remainingCents,
      status,
      payments: pList,
    };
  });

  if (filters?.status && filters.status !== "all") {
    items = items.filter((item) => item.status === filters.status);
  }

  let nextCursor: string | undefined;
  if (items.length > limit) {
    items.pop();
    const lastItem = items[items.length - 1];
    nextCursor = lastItem
      ? `${new Date(lastItem.createdAt).toISOString()}|${lastItem.id}`
      : undefined;
  }

  return { items, nextCursor };
}

export async function getReceivableById(id: string): Promise<ReceivableWithPayments | null> {
  const [row] = await db
    .select()
    .from(receivable)
    .where(and(eq(receivable.id, id), isNull(receivable.deletedAt)));

  if (!row) return null;

  const payments = await db
    .select({
      id: receivablePayment.id,
      receivableId: receivablePayment.receivableId,
      date: receivablePayment.date,
      amountCents: receivablePayment.amountCents,
      accountId: receivablePayment.accountId,
      accountName: account.name,
      notes: receivablePayment.notes,
      deletedAt: receivablePayment.deletedAt,
      createdAt: receivablePayment.createdAt,
      updatedAt: receivablePayment.updatedAt,
    })
    .from(receivablePayment)
    .leftJoin(account, eq(receivablePayment.accountId, account.id))
    .where(and(eq(receivablePayment.receivableId, id), isNull(receivablePayment.deletedAt)))
    .orderBy(desc(receivablePayment.date), desc(receivablePayment.createdAt));

  const pList = payments.map((p) => ({
    ...p,
    accountName: p.accountName ?? undefined,
  }));
  const paidAmountCents = pList.reduce((acc, p) => acc + p.amountCents, 0);
  const remainingCents = Math.max(0, row.amountCents - paidAmountCents);
  const status: "open" | "paid" = remainingCents <= 0 ? "paid" : "open";

  return {
    ...row,
    paidAmountCents,
    remainingCents,
    status,
    payments: pList,
  };
}

