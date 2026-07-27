import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { catalogComponent } from "../catalog/db";
import { orderComponent } from "../orders/db";

// ─────────────────────────────────────────────────────────────────────────
// دفتر حركة المخزون — catalog_movement
// ─────────────────────────────────────────────────────────────────────────
// جدول مستقل لتسجيل حركات المخزون الفيزيائي (in/out). تشغيلي بحت — لا يدخل
// P&L ولا الميزانية ولا حقوق الملكية ولا حركة الصندوق. يُستخدم لعرض الرصيد
// المتاح في الـ picker وللتحذيرات ولـ IC-12 (informational WARN only).
//
// الكتابة:
//   - 'in'  من source_type='purchase' داخل createPurchase (إن كان الصنف متتبَّعاً).
//   - 'in'  من source_type='opening' عند تفعيل التتبّع لأول مرة مع رصيد افتتاحي.
//   - 'in'  من source_type='manual_in' عبر adjustStock (تسوية يدوية موجبة).
//   - 'out' من source_type='order_delivery' داخل convertOrderToSale — source_id=sale.id،
//           order_component_id=المكوّن المرتبط.
//   - 'out' من source_type='manual_out' عبر adjustStock (تسوية يدوية سالبة — صرف يدوي).
//   - 'out' من source_type='adjustment' (تسوية عامة، نادر).
//
// الحذف الناعم:
//   - reverseSale يحذف ناعماً كل حركة out بحيث source_id = sale.id.
//   - updatePurchase يحذف ناعماً الحركة القديمة قبل إدراج الجديدة (إن تغيّرت الكمية/الربط).
// ─────────────────────────────────────────────────────────────────────────

export const catalogMovement = pgTable(
  "catalog_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    catalogComponentId: uuid("catalog_component_id")
      .notNull()
      .references(() => catalogComponent.id, { onDelete: "restrict" }),
    direction: text("direction").notNull(), // 'in' | 'out'
    quantity: integer("quantity").notNull(),
    sourceType: text("source_type").notNull(), // 'purchase' | 'order_delivery' | 'opening' | 'adjustment' | 'manual_in' | 'manual_out'
    sourceId: uuid("source_id"), // sale.id (for order_delivery) | purchase.id (for purchase) | null
    orderComponentId: uuid("order_component_id").references(() => orderComponent.id, {
      onDelete: "restrict",
    }),
    // Phase 3-revised (D4 fix) — سعر الوحدة بالـ fils لكل وحدة عند تسجيل الحركة.
    // للحركة `in` من purchase: unit_cost_cents = floor(purchase.totalCents / quantity).
    // للحركة `out` من order_delivery: unit_cost_cents = التكلفة الوسطية المرجَّحة
    // لحظة البيع (مجموع (qty×unit_cost) لكل الحركات in النشطة ÷ مجموع الكميات).
    // nullable — يستعمل فقط للأصناف المتتبَّعة. الأصناف غير المتتبَّعة تتركه NULL.
    // وضع `mode: "number"` يُرجِع JS number (القيم صغيرة genug لـ safe integer).
    unitCostCents: bigint("unit_cost_cents", { mode: "number" }),
    // SA1 (A1 fix) — إجمالي قيمة الحركة بالـ fils (integer، لا تقريب). يُستخدَم
    // في getFinancialPosition.inventoryValueCents و computeOperatingPnl.cogsCents
    // بدل `qty × unit_cost_cents` لتفادي انحراف كسور الـ fils عند الشراء بكمية
    // لا تقبل القسمة على totalCents. مثال: 3 وحدات بـ 1000 fils → floor(1000/3)=333
    // لكل وحدة، لكن total_value_cents = 1000 بالضبط (العدد الصحيح الأصلي).
    // - للحركة `in` من purchase: total_value_cents = purchase.totalCents (مطابقاً
    //   لمبلغ الصندوق المخصوم)، فلا يظهر equityDrift.
    // - للحركة `out` من order_delivery أو manual_out: total_value_cents =
    //   qty × unit_cost_cents (COGS لتلك الحركة، مطابقاً للقيمة المخصومة من المخزون).
    // - للحركات الافتتاحية/اليدوية بلا سعر: NULL — صيغة القراءة coalesce إلى
    //   `qty × coalesce(unit_cost_cents, 0)` (= 0).
    // السماح بـ NULL عمداً: الحركات القديمة (قبل migration 0024) تُترك NULL
    // وتعتمد على الـ fallback `qty × coalesce(unit_cost_cents, 0)`. هذا يُبقي
    // التراجع متاحاً ويُعامِل الحركات التاريخية بنفس صيغة ما قبل الإصلاح.
    totalValueCents: bigint("total_value_cents", { mode: "number" }),
    notes: text("notes").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("catalog_movement_direction_enum", sql`${t.direction} in ('in','out')`),
    check(
      "catalog_movement_source_type_enum",
      sql`${t.sourceType} in ('purchase','order_delivery','opening','adjustment','manual_in','manual_out')`,
    ),
    check("catalog_movement_quantity_positive", sql`${t.quantity} > 0`),
    // فهرس (catalog_component_id, date DESC) — يُسرِّع استعلام الرصيد التراكمي
    // وحركات الصنف في الـ picker. فلتر WHERE deleted_at IS NULL يُبقي الفهرس صغيراً.
    index("catalog_movement_component_date_idx")
      .on(t.catalogComponentId, t.date.desc())
      .where(sql`deleted_at IS NULL`),
    // فهرس (source_type, source_id) — يُسرِّع البحث عن كل الحركات المرتبطة بـ sale
    // (في reverseSale و getCatalogMovementsForOrder) أو بـ purchase (في updatePurchase).
    index("catalog_movement_source_idx")
      .on(t.sourceType, t.sourceId)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type CatalogMovement = typeof catalogMovement.$inferSelect;
export type NewCatalogMovement = Omit<
  typeof catalogMovement.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
>;
