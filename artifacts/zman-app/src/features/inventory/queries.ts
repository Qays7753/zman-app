import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { catalogComponent } from "../catalog/db";
import { orderComponent } from "../orders/db";
import { sale } from "../finance/db";
import { catalogMovement } from "./db";

// ─────────────────────────────────────────────────────────────────────────
// queries — استعلامات المخزون (قراءة فقط)
// ─────────────────────────────────────────────────────────────────────────
// جميع الاستعلامات تُفلتر deleted_at IS NULL على catalog_movement. الرصيد =
// Σ(in) − Σ(out) لكل صنف، حتى لو كان سالباً (لا منع للسالب — §6 سيناريو 1).
// ─────────────────────────────────────────────────────────────────────────

/**
 * رصيد صنف واحد من الكتالوج حتى تاريخ معيّن (اختياري).
 * الرصيد = Σ(in) − Σ(out) من catalog_movement (لا soft-deleted) حتى asOfDate.
 * لا يدخل الرصيد أي حساب مالي. يُستخدم في الـ picker والتحذيرات و IC-12.
 */
export async function getComponentStock(
  catalogComponentId: string,
  asOfDate?: string,
): Promise<number> {
  const dateCondition = asOfDate
    ? sql`${catalogMovement.date} <= ${asOfDate}`
    : sql`true`;

  const [row] = await db
    .select({
      balance: sql<number>`coalesce(sum(
        case when ${catalogMovement.direction} = 'in' then ${catalogMovement.quantity}
             else -${catalogMovement.quantity} end
      ), 0)::bigint`,
    })
    .from(catalogMovement)
    .where(
      and(
        eq(catalogMovement.catalogComponentId, catalogComponentId),
        isNull(catalogMovement.deletedAt),
        dateCondition,
      ),
    );

  return Number(row?.balance ?? 0);
}

/**
 * حركات صنف من الكتالوج، تنازلياً بالتاريخ. تُستخدم في الـ modal «عرض حركات المخزون».
 * لا تُرجع الحركات المحذوفة ناعماً.
 */
export async function getCatalogMovements(
  catalogComponentId: string,
  limit = 20,
) {
  const rows = await db
    .select({
      id: catalogMovement.id,
      date: catalogMovement.date,
      direction: catalogMovement.direction,
      quantity: catalogMovement.quantity,
      sourceType: catalogMovement.sourceType,
      sourceId: catalogMovement.sourceId,
      orderComponentId: catalogMovement.orderComponentId,
      notes: catalogMovement.notes,
      createdAt: catalogMovement.createdAt,
    })
    .from(catalogMovement)
    .where(
      and(
        eq(catalogMovement.catalogComponentId, catalogComponentId),
        isNull(catalogMovement.deletedAt),
      ),
    )
    .orderBy(desc(catalogMovement.date), desc(catalogMovement.createdAt))
    .limit(limit);

  return rows;
}

/**
 * الحركات المرتبطة بطلب معيّن (عبر sale → source_id = sale.id).
 * يُستخدم في بطاقة "المواد المستهلكة من المخزون" في OrderDetail (card 3.M).
 *
 * مسار الـ join: order.id → sale.orderId → catalog_movement.sourceId (where source_type='order_delivery').
 * تُرجع فقط الحركات النشطة (لا soft-deleted). كل صف يحوي اسم الصنف ووحدته للأرضشفة.
 */
export async function getCatalogMovementsForOrder(orderId: string) {
  const rows = await db
    .select({
      movementId: catalogMovement.id,
      movementDate: catalogMovement.date,
      direction: catalogMovement.direction,
      quantity: catalogMovement.quantity,
      notes: catalogMovement.notes,
      orderComponentId: catalogMovement.orderComponentId,
      componentName: orderComponent.name,
      componentQuantity: orderComponent.quantity,
      catalogComponentId: catalogMovement.catalogComponentId,
      catalogName: catalogComponent.name,
      catalogUnit: catalogComponent.unit,
      defaultCostCents: catalogComponent.defaultCostCents,
    })
    .from(catalogMovement)
    .innerJoin(sale, eq(catalogMovement.sourceId, sale.id))
    .innerJoin(
      orderComponent,
      eq(catalogMovement.orderComponentId, orderComponent.id),
    )
    .innerJoin(
      catalogComponent,
      eq(catalogMovement.catalogComponentId, catalogComponent.id),
    )
    .where(
      and(
        eq(sale.orderId, orderId),
        eq(catalogMovement.sourceType, "order_delivery"),
        isNull(catalogMovement.deletedAt),
        isNull(sale.deletedAt),
      ),
    )
    .orderBy(desc(catalogMovement.date));

  return rows;
}

/**
 * إجمالي قيمة المخزون التقديرية حتى asOfDate (اختياري).
 * = Σ(balance × defaultCostCents) لكل صنف متتبَّع.
 * ملاحظة: القيمة تقديرية (defaultCostCents من الكتالوج، وليس سعر الشراء الفعلي).
 * تستخدم في IC-12 (WARN only) وفي لوحة معلومات المخزون (اختياري).
 */
export async function getInventoryValuation(asOfDate?: string) {
  const dateCondition = asOfDate
    ? sql`${catalogMovement.date} <= ${asOfDate}`
    : sql`true`;

  // رصيد كل صنف متتبَّع = Σ(in) − Σ(out). JOIN مع catalog_component لجلب
  // defaultCostCents والفلترة على tracked=true. الجدول الأيسر هو catalog_component
  // ليشمل الأصناف المتتبَّعة بلا حركات (balance=0).
  const rows = await db
    .select({
      catalogComponentId: catalogComponent.id,
      name: catalogComponent.name,
      unit: catalogComponent.unit,
      defaultCostCents: catalogComponent.defaultCostCents,
      balance: sql<number>`coalesce(sum(
        case when ${catalogMovement.direction} = 'in' then ${catalogMovement.quantity}
             else -${catalogMovement.quantity} end
      ), 0)::bigint`,
    })
    .from(catalogComponent)
    .leftJoin(
      catalogMovement,
      and(
        eq(catalogMovement.catalogComponentId, catalogComponent.id),
        isNull(catalogMovement.deletedAt),
        dateCondition,
      ),
    )
    .where(
      and(
        eq(catalogComponent.tracked, true),
        isNull(catalogComponent.deletedAt),
      ),
    )
    .groupBy(
      catalogComponent.id,
      catalogComponent.name,
      catalogComponent.unit,
      catalogComponent.defaultCostCents,
    );

  const totalEstimatedValueCents = rows.reduce(
    (sum, r) => sum + r.balance * r.defaultCostCents,
    0,
  );

  const totalCatalogs = rows.length;
  const totalMovements = rows.reduce((sum, r) => sum + Math.abs(r.balance), 0);

  return {
    totalCatalogs,
    totalMovements,
    totalEstimatedValueCents,
    items: rows,
  };
}
