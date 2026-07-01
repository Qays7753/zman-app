"use server";

import { and, desc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { order, orderComponent } from "./db";

export interface GetOrdersFilters {
  status?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  date?: string; // YYYY-MM-DD — تصفية حسب يوم بعينه
}

/**
 * جلب قائمة الطلبات مع الفلترة والبحث والملاحة عبر Cursor-based pagination (§10.1)
 */
export async function getOrders({
  status,
  q,
  cursor,
  limit = 20,
  date,
}: GetOrdersFilters = {}) {
  const conditions: (SQL | undefined)[] = [isNull(order.deletedAt)];

  if (status && status !== "all") {
    conditions.push(eq(order.status, status));
  }

  if (q) {
    conditions.push(
      or(
        ilike(order.customerName, `%${q}%`),
        ilike(order.productName, `%${q}%`),
      ),
    );
  }

  if (date) {
    conditions.push(sql`(${order.deliveryDate})::date = ${date}::date`);
  }

  // إذا تم إرسال cursor (وهو ID الطلب الأخير)، نقوم بجلب تاريخه وتصفية ما بعده بشكل ثنائي محدد (Tuple) لمنع تخطي الطلبات ذات نفس التوقيت
  if (cursor) {
    const [cursorOrder] = await db
      .select({ createdAt: order.createdAt })
      .from(order)
      .where(eq(order.id, cursor))
      .limit(1);

    if (cursorOrder) {
      conditions.push(
        sql`(${order.createdAt}, ${order.id}) < (${cursorOrder.createdAt}, ${cursor})`,
      );
    }
  }

  // نجلب limit + 1 للتحقق من وجود صفحة تالية، مع استبعاد الحقول الكبيرة كالملاحظات (PERF-4)
  const rows = await db
    .select({
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerPhoneAlt: order.customerPhoneAlt,
      productName: order.productName,
      quantity: order.quantity,
      totalCostCents: order.totalCostCents,
      additionalCostsCents: order.additionalCostsCents,
      totalPriceCents: order.totalPriceCents,
      status: order.status,
      notes: sql<string>`''`,
      deliveryDate: order.deliveryDate,
      receivedDate: order.receivedDate,
      depositCents: order.depositCents,
      depositDate: order.depositDate,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deletedAt: order.deletedAt,
    })
    .from(order)
    .where(and(...conditions))
    .orderBy(desc(order.createdAt), desc(order.id))
    .limit(limit + 1);

  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor = hasNextPage && lastItem ? lastItem.id : undefined;

  return {
    items,
    nextCursor,
    hasNextPage,
  };
}

/**
 * جلب أيام الشهر التي تحتوي على طلبات (للتقويم) — يُرجع مصفوفة من "YYYY-MM-DD"
 */
export async function getOrderDatesForMonth(
  year: number,
  month: number,
): Promise<string[]> {
  const rows = await db
    .select({
      d: sql<string>`TO_CHAR((${order.deliveryDate})::date, 'YYYY-MM-DD')`,
    })
    .from(order)
    .where(
      and(
        isNull(order.deletedAt),
        sql`EXTRACT(YEAR FROM ${order.deliveryDate}) = ${year}`,
        sql`EXTRACT(MONTH FROM ${order.deliveryDate}) = ${month}`,
      ),
    )
    .groupBy(sql`(${order.deliveryDate})::date`);

  return rows.map((r) => r.d);
}

/**
 * جلب تفاصيل طلب واحد مع مكوناته الفرعية (§1.2)
 */
export async function getOrder(id: string) {
  const [[row], components] = await Promise.all([
    db
      .select()
      .from(order)
      .where(and(eq(order.id, id), isNull(order.deletedAt)))
      .limit(1),
    db
      .select()
      .from(orderComponent)
      .where(eq(orderComponent.orderId, id)),
  ]);

  if (!row) return null;

  return {
    ...row,
    components,
  };
}
