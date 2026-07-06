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
    conditions.push(sql`(COALESCE(${order.deliveryDate}, ${order.receivedDate}))::date = ${date}::date`);
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

export interface CalendarDayInfo {
  statuses: string[]; // الحالات الفريدة الموجودة في اليوم (للنقاط الملوّنة)
  count: number; // العدد الكلي للطلبات في اليوم
}

export async function getOrderDatesForMonth(
  year: number,
  month: number,
): Promise<Record<string, CalendarDayInfo>> {
  const rows = await db
    .select({
      d: sql<string>`TO_CHAR((COALESCE(${order.deliveryDate}, ${order.receivedDate}))::date, 'YYYY-MM-DD')`,
      status: order.status,
    })
    .from(order)
    .where(
      and(
        isNull(order.deletedAt),
        sql`EXTRACT(YEAR FROM COALESCE(${order.deliveryDate}, ${order.receivedDate})) = ${year}`,
        sql`EXTRACT(MONTH FROM COALESCE(${order.deliveryDate}, ${order.receivedDate})) = ${month}`,
      ),
    );

  const map: Record<string, CalendarDayInfo> = {};
  for (const r of rows) {
    if (!r.d) continue;
    if (!map[r.d]) map[r.d] = { statuses: [], count: 0 };
    map[r.d].count += 1; // عدّ كل طلب
    if (!map[r.d].statuses.includes(r.status)) {
      map[r.d].statuses.push(r.status);
    }
  }
  return map;
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

/**
 * عدّادات الطلبات حسب الحالة (خفيف — للفلتر الاحترافي في الهيدر).
 * يُرجع { draft, sent, confirmed, delivered, cancelled } بلا قيود تاريخ.
 */
export async function getOrderStatusCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: order.status, count: sql<number>`count(*)::int` })
    .from(order)
    .where(isNull(order.deletedAt))
    .groupBy(order.status);

  const counts: Record<string, number> = {
    draft: 0,
    sent: 0,
    confirmed: 0,
    delivered: 0,
    cancelled: 0,
  };
  for (const row of rows) {
    counts[row.status] = row.count;
  }
  return counts;
}
