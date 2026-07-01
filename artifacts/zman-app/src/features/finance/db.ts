import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { order } from "../orders/db";

// 1. Purchase Table
export const purchase = pgTable(
  "purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    item: text("item").notNull(),
    supplier: text("supplier").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    unitCostCents: integer("unit_cost_cents").notNull(),
    totalCents: integer("total_cents")
      .generatedAlwaysAs(() => sql`quantity * unit_cost_cents`)
      .notNull(),
    notes: text("notes").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("purchase_item_length", sql`char_length(${table.item}) <= 200`),
      check(
        "purchase_supplier_length",
        sql`char_length(${table.supplier}) <= 200`,
      ),
      check("purchase_quantity_positive", sql`${table.quantity} > 0`),
      check("purchase_unit_cost_nonnegative", sql`${table.unitCostCents} >= 0`),
      check("purchase_notes_length", sql`char_length(${table.notes}) <= 1000`),
      index("purchase_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("purchase_supplier_idx")
        .on(table.supplier)
        .where(sql`deleted_at is null`),
    ];
  },
);

// 2. Expense Table
export const expense = pgTable(
  "expense",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check(
        "expense_category_length",
        sql`char_length(${table.category}) <= 200`,
      ),
      check("expense_amount_nonnegative", sql`${table.amountCents} >= 0`),
      check(
        "expense_description_length",
        sql`char_length(${table.description}) <= 1000`,
      ),
      index("expense_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("expense_category_idx")
        .on(table.category)
        .where(sql`deleted_at is null`),
    ];
  },
);

// 3. Sale Table
export const sale = pgTable(
  "sale",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    source: text("source").notNull(), // 'manual' | 'order'
    orderId: uuid("order_id").references(() => order.id), // Plain reference to retain audit trail
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("sale_source_length", sql`char_length(${table.source}) <= 32`),
      check("sale_source_enum", sql`${table.source} in ('manual','order')`),
      check("sale_amount_nonnegative", sql`${table.amountCents} >= 0`),
      check(
        "sale_description_length",
        sql`char_length(${table.description}) <= 1000`,
      ),
      // مؤشر فريد يمنع تكرار تحويل نفس الطلب إلى مبيعات (§5.3)
      uniqueIndex("sale_order_id_unique_idx")
        .on(table.orderId)
        .where(sql`order_id is not null and deleted_at is null`),
      index("sale_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("sale_source_idx").on(table.source).where(sql`deleted_at is null`),
    ];
  },
);

// 4. Purchase Item Catalog Table
export const purchaseItemCatalog = pgTable(
  "purchase_item_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("purchase_item_catalog_name_length", sql`char_length(${table.name}) <= 200`),
    index("purchase_item_catalog_name_idx")
      .on(table.name)
      .where(sql`deleted_at is null`),
  ],
);

export type PurchaseItemCatalog = typeof purchaseItemCatalog.$inferSelect;
export type NewPurchaseItemCatalog = Pick<PurchaseItemCatalog, "name">;

// 5. Expense Category Catalog Table
export const expenseCategoryCatalog = pgTable(
  "expense_category_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("expense_category_catalog_name_length", sql`char_length(${table.name}) <= 200`),
    index("expense_category_catalog_name_idx")
      .on(table.name)
      .where(sql`deleted_at is null`),
  ],
);

export type ExpenseCategoryCatalog = typeof expenseCategoryCatalog.$inferSelect;
export type NewExpenseCategoryCatalog = Pick<ExpenseCategoryCatalog, "name">;

