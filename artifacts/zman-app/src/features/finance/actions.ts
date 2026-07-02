"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { idempotencyKey, order } from "../orders/db";
import { expense, purchase, sale, purchaseItemCatalog, expenseCategoryCatalog } from "./db";
import {
  expenseInputSchema,
  purchaseInputSchema,
  saleInputSchema,
} from "./schema";

// نوع الإرجاع الموحد (Discriminated Union) (§18 rule 8)
export type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

// دالة فحص الـ Rate Limit الموحدة لمنع التكرار (§15.15)
async function checkRateLimit(): Promise<{ success: boolean }> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  return await ratelimit.limit(ip);
}

// -------------------------------------------------------------
// 1. إجراءات المشتريات (Purchases Actions)
// -------------------------------------------------------------

export async function createPurchase(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = purchaseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // التحقق من الـ Idempotency Key (§5.6)
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_purchase") {
            const [p] = await tx
              .select()
              .from(purchase)
              .where(eq(purchase.id, existingKey.targetId));
            return { status: "ok", data: p };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [newPurchase] = await tx
        .insert(purchase)
        .values({
          date: parsed.data.date,
          item: parsed.data.item,
          supplier: parsed.data.supplier,
          quantity: parsed.data.quantity,
          unitCostCents: parsed.data.unitCostCents,
          notes: parsed.data.notes,
        })
        .returning();

      if (!newPurchase) throw new Error("فشل إدخال المشتريات");

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_purchase",
          targetId: newPurchase.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newPurchase };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updatePurchase(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = purchaseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchase)
        .where(eq(purchase.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل لمنع الكتابة الصامتة (§5.6)
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [updatedPurchase] = await tx
        .update(purchase)
        .set({
          date: parsed.data.date,
          item: parsed.data.item,
          supplier: parsed.data.supplier,
          quantity: parsed.data.quantity,
          unitCostCents: parsed.data.unitCostCents,
          notes: parsed.data.notes,
          updatedAt: new Date(),
        })
        .where(
          eq(purchase.id, id),
        )
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: updatedPurchase };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deletePurchase(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(purchase)
        .where(eq(purchase.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [deleted] = await tx
        .update(purchase)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(purchase.id, id),
        )
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 2. إجراءات المصاريف (Expenses Actions)
// -------------------------------------------------------------

export async function createExpense(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = expenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_expense") {
            const [e] = await tx
              .select()
              .from(expense)
              .where(eq(expense.id, existingKey.targetId));
            return { status: "ok", data: e };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [newExpense] = await tx
        .insert(expense)
        .values({
          date: parsed.data.date,
          category: parsed.data.category,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
        })
        .returning();

      if (!newExpense) throw new Error("فشل إدخال المصاريف");

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_expense",
          targetId: newExpense.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newExpense };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updateExpense(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = expenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expense)
        .where(eq(expense.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [updatedExpense] = await tx
        .update(expense)
        .set({
          date: parsed.data.date,
          category: parsed.data.category,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
          updatedAt: new Date(),
        })
        .where(
          eq(expense.id, id),
        )
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: updatedExpense };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deleteExpense(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(expense)
        .where(eq(expense.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [deleted] = await tx
        .update(expense)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(expense.id, id),
        )
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 3. إجراءات المبيعات (Sales Actions)
// -------------------------------------------------------------

export async function createSale(
  rawInput: unknown,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = saleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "create_sale") {
            const [s] = await tx
              .select()
              .from(sale)
              .where(eq(sale.id, existingKey.targetId));
            return { status: "ok", data: s };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [newSale] = await tx
        .insert(sale)
        .values({
          date: parsed.data.date,
          source: parsed.data.source,
          orderId: parsed.data.orderId,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
        })
        .returning();

      if (!newSale) throw new Error("فشل إدخال المبيعات");

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "create_sale",
          targetId: newSale.id,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newSale };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function updateSale(
  id: string,
  updatedAt: string,
  rawInput: unknown,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  const parsed = saleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(sale)
        .where(eq(sale.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [updatedSale] = await tx
        .update(sale)
        .set({
          date: parsed.data.date,
          source: parsed.data.source,
          orderId: parsed.data.orderId,
          amountCents: parsed.data.amountCents,
          description: parsed.data.description,
          updatedAt: new Date(),
        })
        .where(eq(sale.id, id))
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: updatedSale };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

export async function deleteSale(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(sale)
        .where(eq(sale.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "السجل غير موجود" };
      }

      // فحص التزامن المتفائل
      const clientTime = new Date(updatedAt).getTime();
      const dbTime = new Date(existing.updatedAt).getTime();
      if (clientTime !== dbTime) {
        return {
          status: "error",
          message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة وحاول مجدداً",
        };
      }

      const [deleted] = await tx
        .update(sale)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sale.id, id))
        .returning();

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 4. تحويل الطلب إلى مبيعات (Convert Order to Sale)
// -------------------------------------------------------------

export async function convertOrderToSale(
  orderId: string,
  requestId?: string,
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 1. فحص الـ Idempotency Key كأول خطوة لخدمة المحاولات المكررة (§5.6)
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "convert_to_sale") {
            const [s] = await tx
              .select()
              .from(sale)
              .where(eq(sale.orderId, orderId));
            return { status: "ok", data: s };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      // 2. قفل صف الطلب الحالي لمنع التعديل المتزامن (Row-level locking) (§5.6)
      const [orderRow] = await tx
        .select()
        .from(order)
        .where(eq(order.id, orderId))
        .for("update");

      if (!orderRow) {
        return { status: "error", message: "الطلب غير موجود" };
      }

      if (orderRow.deletedAt) {
        return { status: "error", message: "لا يمكن تحويل طلب محذوف" };
      }

      // 3. التحقق من وجود مبيعات غير محذوفة مرتبطة بهذا الطلب مسبقاً لمنع التكرار
      const [existingSale] = await tx
        .select()
        .from(sale)
        .where(and(eq(sale.orderId, orderId), isNull(sale.deletedAt)));

      if (existingSale) {
        return {
          status: "error",
          message: "هذا الطلب تم تحويله إلى مبيعات مسبقاً",
        };
      }

      // 4. تسجيل مفتاح الـ Idempotency
      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "convert_to_sale",
          targetId: orderId,
        });
      }

      // 5. إدراج سجل المبيعات الفعلي
      const [newSale] = await tx
        .insert(sale)
        .values({
          source: "order",
          orderId: orderId,
          amountCents: orderRow.totalPriceCents,
          description: `مبيعات الطلب #${orderId.slice(0, 8)} - العميل ${orderRow.customerName}`,
        })
        .returning();

      // 6. تحديث حالة الطلب إلى تم التوصيل (delivered)
      await tx
        .update(order)
        .set({
          status: "delivered",
          updatedAt: new Date(),
        })
        .where(eq(order.id, orderId));

      revalidatePath("/finance");
      revalidatePath("/orders");
      return { status: "ok", data: newSale };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// -------------------------------------------------------------
// 5. أصناف المشتريات (Purchase Item Catalog Actions)
// -------------------------------------------------------------

export async function getPurchaseItemCatalog() {
  try {
    const items = await db
      .select()
      .from(purchaseItemCatalog)
      .where(isNull(purchaseItemCatalog.deletedAt))
      .orderBy(purchaseItemCatalog.name);
    return items;
  } catch (error) {
    console.error("Failed to fetch purchase item catalog:", error);
    return [];
  }
}

export async function createPurchaseItemCatalog(name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الصنف مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الصنف طويل جداً" };
  }

  try {
    const [inserted] = await db
      .insert(purchaseItemCatalog)
      .values({ name: name.trim() })
      .returning();

    revalidatePath("/finance");
    return { status: "ok", data: inserted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function updatePurchaseItemCatalog(id: string, name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الصنف مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الصنف طويل جداً" };
  }

  try {
    const [updated] = await db
      .update(purchaseItemCatalog)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(and(eq(purchaseItemCatalog.id, id), isNull(purchaseItemCatalog.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الصنف غير موجود أو تم حذفه" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deletePurchaseItemCatalog(id: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [deleted] = await db
      .update(purchaseItemCatalog)
      .set({ deletedAt: new Date() })
      .where(and(eq(purchaseItemCatalog.id, id), isNull(purchaseItemCatalog.deletedAt)))
      .returning();

    if (!deleted) {
      return { status: "error", message: "الصنف غير موجود أو تم حذفه مسبقاً" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: deleted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 6. فئات المصاريف (Expense Category Catalog Actions)
// -------------------------------------------------------------

export async function getExpenseCategoryCatalog() {
  try {
    const items = await db
      .select()
      .from(expenseCategoryCatalog)
      .where(isNull(expenseCategoryCatalog.deletedAt))
      .orderBy(expenseCategoryCatalog.name);
    return items;
  } catch (error) {
    console.error("Failed to fetch expense category catalog:", error);
    return [];
  }
}

export async function createExpenseCategoryCatalog(name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الفئة مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الفئة طويل جداً" };
  }

  try {
    const [inserted] = await db
      .insert(expenseCategoryCatalog)
      .values({ name: name.trim() })
      .returning();

    revalidatePath("/finance");
    return { status: "ok", data: inserted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function updateExpenseCategoryCatalog(id: string, name: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!name || name.trim().length === 0) {
    return { status: "error", message: "اسم الفئة مطلوب" };
  }
  if (name.length > 200) {
    return { status: "error", message: "اسم الفئة طويل جداً" };
  }

  try {
    const [updated] = await db
      .update(expenseCategoryCatalog)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(and(eq(expenseCategoryCatalog.id, id), isNull(expenseCategoryCatalog.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الفئة غير موجودة أو تم حذفها" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteExpenseCategoryCatalog(id: string): Promise<ActionResponse> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [deleted] = await db
      .update(expenseCategoryCatalog)
      .set({ deletedAt: new Date() })
      .where(and(eq(expenseCategoryCatalog.id, id), isNull(expenseCategoryCatalog.deletedAt)))
      .returning();

    if (!deleted) {
      return { status: "error", message: "الفئة غير موجودة أو تم حذفها مسبقاً" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: deleted };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

