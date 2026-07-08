import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { orders } from "./orders";

export const purchases = pgTable("purchases", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  item: text("item").notNull(),
  supplier: text("supplier").notNull().default(""),
  quantity: integer("quantity").notNull().default(1),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  source: text("source").notNull().default("manual"),
  orderId: text("order_id").references(() => orders.id, { onDelete: "set null" }),
  description: text("description").notNull().default(""),
  amountCents: integer("amount_cents").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});
