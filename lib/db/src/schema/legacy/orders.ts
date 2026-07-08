import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull().default(""),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalCostCents: integer("total_cost_cents").notNull().default(0),
  overheadCostCents: integer("overhead_cost_cents").notNull().default(0),
  totalPriceCents: integer("total_price_cents").notNull().default(0),
  status: text("status").notNull().default("draft"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { mode: "string" }),
});

export const orderComponents = pgTable("order_components", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
});
