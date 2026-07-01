import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const order = pgTable(
  "order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerPhoneAlt: text("customer_phone_alt"),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    totalCostCents: integer("total_cost_cents").notNull().default(0),
    additionalCostsCents: integer("additional_costs_cents").notNull().default(0),
    totalPriceCents: integer("total_price_cents").notNull().default(0),
    status: text("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    deliveryDate: date("delivery_date"),
    receivedDate: date("received_date").notNull().default(sql`CURRENT_DATE`),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositDate: date("deposit_date"),
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
        "customer_name_length",
        sql`char_length(${table.customerName}) <= 200`,
      ),
      check(
        "customer_phone_length",
        sql`char_length(${table.customerPhone}) <= 32`,
      ),
      check(
        "customer_phone_alt_length",
        sql`char_length(${table.customerPhoneAlt}) <= 32`,
      ),
      check(
        "product_name_length",
        sql`char_length(${table.productName}) <= 200`,
      ),
      check("quantity_positive", sql`${table.quantity} > 0`),
      check("total_cost_nonnegative", sql`${table.totalCostCents} >= 0`),
      check("additional_costs_nonneg", sql`${table.additionalCostsCents} >= 0`),
      check("total_price_nonnegative", sql`${table.totalPriceCents} >= 0`),
      check("order_deposit_nonnegative", sql`${table.depositCents} >= 0`),
      check(
        "status_enum",
        sql`${table.status} in ('draft','sent','confirmed','delivered','cancelled')`,
      ),
      check("status_length", sql`char_length(${table.status}) <= 32`),
      check("notes_length", sql`char_length(${table.notes}) <= 1000`),
      // Indexes
      index("order_status_idx")
        .on(table.status, table.createdAt.desc())
        .where(sql`deleted_at is null`),
      index("order_created_at_idx")
        .on(table.createdAt.desc())
        .where(sql`deleted_at is null`),
    ];
  },
);

export const orderComponent = pgTable(
  "order_component",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    costCents: integer("cost_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("name_length", sql`char_length(${table.name}) <= 200`),
      check("cost_cents_nonnegative", sql`${table.costCents} >= 0`),
      check("quantity_positive", sql`${table.quantity} > 0`),
      // Index
      index("order_component_order_idx").on(table.orderId),
    ];
  },
);

export const idempotencyKey = pgTable(
  "idempotency_key",
  {
    requestId: uuid("request_id").primaryKey(),
    action: text("action").notNull(),
    targetId: uuid("target_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [check("action_length", sql`char_length(${table.action}) <= 32`)];
  },
);

export const messageTemplate = pgTable(
  "message_template",
  {
    key: text("key").primaryKey(),
    template: text("template").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("template_length", sql`char_length(${table.template}) <= 5000`),
  ],
);
