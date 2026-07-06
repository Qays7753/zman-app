"use server";

import { and, eq, isNull, sql, sum, desc, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { idempotencyKey, order } from "../orders/db";
import { getAmmanDate } from "@/lib/utils";
import {
  expense,
  purchase,
  sale,
  purchaseItemCatalog,
  expenseCategoryCatalog,
  account,
  cashMovement,
  ownerTransaction,
  openingBalance,
  type Account,
  type OwnerTransaction,
  type OpeningBalance,
} from "./db";
import {
  expenseInputSchema,
  purchaseInputSchema,
  saleInputSchema,
  accountInputSchema,
  ownerTransactionInputSchema,
  openingBalanceInputSchema,
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

/**
 * الحصول على الحساب النقدي الافتراضي أو إنشاؤه بشكل تلقائي إذا لم يكن موجوداً
 * لمنع تعطل عمليات البيع/المصاريف (التزاماً بـ §4)
 */
export async function getOrCreateDefaultCashAccount(tx: any): Promise<string> {
  const [existing] = await tx
    .select()
    .from(account)
    .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  // إدراج مباشر (لا onConflict — لا يوجد قيد فريد على account.name في القاعدة،
  // فاستخدام ON CONFLICT (name) يفشل بـ "no unique constraint matching").
  // السباق النادر (tx متزامن ينشئ الحساب) نعالجه بقراءة الحساب مجدداً عند الخطأ.
  let newAcc: { id: string; openingBalanceCents: number } | undefined;
  try {
    const [inserted] = await tx
      .insert(account)
      .values({
        name: "الصندوق الرئيسي",
        type: "cash",
        openingBalanceCents: 0,
      })
      .returning();
    newAcc = inserted;
  } catch {
    // ربما أنشأه tx متزامن — اقرأه مجدداً
    const [existing2] = await tx
      .select()
      .from(account)
      .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
      .limit(1);
    if (!existing2) throw new Error("Failed to resolve default cash account");
    return existing2.id;
  }

  if (!newAcc) {
    const [existing2] = await tx
      .select()
      .from(account)
      .where(and(eq(account.type, "cash"), eq(account.name, "الصندوق الرئيسي"), isNull(account.deletedAt)))
      .limit(1);
    if (!existing2) throw new Error("Failed to resolve default cash account");
    return existing2.id;
  }

  // إضافة حركة الرصيد الافتتاحي التلقائي (فقط إذا كان الحساب جديداً تماماً والرصيد الافتتاحي أكبر من صفر)
  if (newAcc.openingBalanceCents > 0) {
    await tx.insert(cashMovement).values({
      date: getAmmanDate(),
      accountId: newAcc.id,
      direction: "in",
      amountCents: newAcc.openingBalanceCents,
      sourceType: "opening",
      description: "رصيد افتتاحي تلقائي (تم إنشاؤه عند تسجيل حركة مالية أولى)",
    });
  }

  return newAcc.id;
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

      // إدراج حركة الصندوق (التزاماً بـ §3)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      await tx.insert(cashMovement).values({
        date: newPurchase.date,
        accountId: defaultAccountId,
        direction: "out",
        amountCents: newPurchase.totalCents,
        sourceType: "purchase",
        sourceId: newPurchase.id,
        description: newPurchase.notes || `شراء مواد: ${newPurchase.item} (الكمية: ${newPurchase.quantity})`,
      });

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!updatedPurchase) {
        throw new Error("فشل تحديث المشتريات");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3) (P1-1)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      const [updatedMovement] = await tx
        .update(cashMovement)
        .set({
          amountCents: updatedPurchase.totalCents,
          date: updatedPurchase.date,
          accountId: defaultAccountId,
          description: updatedPurchase.notes || `شراء مواد: ${updatedPurchase.item} (الكمية: ${updatedPurchase.quantity})`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "purchase"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        )
        .returning();

      if (!updatedMovement && updatedPurchase.totalCents > 0) {
        await tx.insert(cashMovement).values({
          date: updatedPurchase.date,
          accountId: defaultAccountId,
          direction: "out",
          amountCents: updatedPurchase.totalCents,
          sourceType: "purchase",
          sourceId: id,
          description: updatedPurchase.notes || `شراء مواد: ${updatedPurchase.item} (الكمية: ${updatedPurchase.quantity})`,
        });
      }

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!deleted) {
        throw new Error("فشل حذف المشتريات");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "purchase"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

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

      // إدراج حركة الصندوق (التزاماً بـ §3)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      await tx.insert(cashMovement).values({
        date: newExpense.date,
        accountId: defaultAccountId,
        direction: "out",
        amountCents: newExpense.amountCents,
        sourceType: "expense",
        sourceId: newExpense.id,
        description: newExpense.description || `مصروف: ${newExpense.category}`,
      });

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!updatedExpense) {
        throw new Error("فشل تحديث المصاريف");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3) (P1-1)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      const [updatedMovement] = await tx
        .update(cashMovement)
        .set({
          amountCents: updatedExpense.amountCents,
          date: updatedExpense.date,
          accountId: defaultAccountId,
          description: updatedExpense.description || `مصروف: ${updatedExpense.category}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "expense"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        )
        .returning();

      if (!updatedMovement && updatedExpense.amountCents > 0) {
        await tx.insert(cashMovement).values({
          date: updatedExpense.date,
          accountId: defaultAccountId,
          direction: "out",
          amountCents: updatedExpense.amountCents,
          sourceType: "expense",
          sourceId: id,
          description: updatedExpense.description || `مصروف: ${updatedExpense.category}`,
        });
      }

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!deleted) {
        throw new Error("فشل حذف المصاريف");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "expense"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

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

      // إدراج حركة الصندوق (التزاماً بـ §3)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      await tx.insert(cashMovement).values({
        date: newSale.date,
        accountId: defaultAccountId,
        direction: "in",
        amountCents: newSale.amountCents,
        sourceType: "sale",
        sourceId: newSale.id,
        description: newSale.description || "مبيعات يدوية مباشرة",
      });

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!updatedSale) {
        throw new Error("فشل تحديث المبيعات");
      }

      // تحديث حركة الصندوق المرتبطة (التزاماً بـ §3)
      const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
      let amountToPost = updatedSale.amountCents;
      if (updatedSale.source === "order" && updatedSale.orderId) {
        const [ord] = await tx.select().from(order).where(eq(order.id, updatedSale.orderId));
        if (ord) {
          amountToPost = Math.max(0, updatedSale.amountCents - ord.depositCents);
        }
      }

      const [existingMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.sourceType, "sale"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      if (amountToPost > 0) {
        if (existingMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: amountToPost,
              date: updatedSale.date,
              accountId: defaultAccountId,
              description: updatedSale.description || "مبيعات نقدية",
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: updatedSale.date,
            accountId: defaultAccountId,
            direction: "in",
            amountCents: amountToPost,
            sourceType: "sale",
            sourceId: updatedSale.id,
            description: updatedSale.description || "مبيعات نقدية",
          });
        }
      } else if (existingMov) {
        await tx
          .update(cashMovement)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(cashMovement.id, existingMov.id));
      }

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
          message: "تم تحديث البيانات من جهة أخرى",
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

      if (!deleted) {
        throw new Error("فشل حذف المبيعات");
      }

      // حذف حركة الصندوق المرتبطة (التزاماً بـ §4)
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "sale"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

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

      if (orderRow.totalPriceCents <= 0) {
        return { status: "error", message: "لا يمكن تحويل طلب بسعر صفر إلى مبيعات. حدّد السعر أولاً." };
      }

      // P0-2 extension: منع تحويل طلب ملغى إلى مبيعات
      if (orderRow.status === "cancelled") {
        return { status: "error", message: "لا يمكن تحويل طلب ملغى. أنشئ طلباً جديداً بدلاً من ذلك." };
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
      const saleDate = getAmmanDate();
      const [newSale] = await tx
        .insert(sale)
        .values({
          date: saleDate,
          source: "order",
          orderId: orderId,
          amountCents: orderRow.totalPriceCents,
          description: `مبيعات الطلب #${orderId.slice(0, 8)}`,
        })
        .returning();

      if (!newSale) {
        throw new Error("فشل تحويل الطلب إلى مبيعات");
      }

      // 5.1. إدراج حركة الصندوق للمبلغ المتبقي فقط (التزاماً بـ §3)
      const remainderCents = orderRow.totalPriceCents - orderRow.depositCents;
      if (remainderCents > 0) {
        const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
        await tx.insert(cashMovement).values({
          date: saleDate,
          accountId: defaultAccountId,
          direction: "in",
          amountCents: remainderCents,
          sourceType: "sale",
          sourceId: newSale.id,
          description: `متبقي مبيعات الطلب #${orderId.slice(0, 8)}`,
        });
      }

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

// -------------------------------------------------------------
// 6. إجراءات الحسابات المالية (Accounts Actions)
// -------------------------------------------------------------

export async function createAccount(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = accountInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const [newAcc] = await tx
        .insert(account)
        .values({
          name: parsed.data.name,
          type: parsed.data.type,
          openingBalanceCents: parsed.data.openingBalanceCents,
        })
        .returning();

      if (!newAcc) throw new Error("فشل إنشاء الحساب");

      // Invariant: opening amounts live in cash_movement(sourceType='opening'); openingBalanceCents is display-only.
      if (parsed.data.openingBalanceCents > 0) {
        // إدراج حركة الرصيد الافتتاحي
        await tx.insert(cashMovement).values({
          date: getAmmanDate(),
          accountId: newAcc.id,
          direction: "in",
          amountCents: parsed.data.openingBalanceCents,
          sourceType: "opening",
          description: `رصيد افتتاحي لحساب: ${newAcc.name}`,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: newAcc };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function archiveAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [updated] = await db
      .update(account)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الحساب غير موجود" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function unarchiveAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [updated] = await db
      .update(account)
      .set({ isArchived: false, updatedAt: new Date() })
      .where(and(eq(account.id, id), isNull(account.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "الحساب غير موجود" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteAccount(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    return await db.transaction(async (tx) => {
      // تحقق من عدم وجود حركات نشطة مرتبطة بالحساب (عدا الأرصدة الافتتاحية إن وجدت)
      const [movementsCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, id),
            isNull(cashMovement.deletedAt),
            ne(cashMovement.sourceType, "opening")
          )
        );

      if ((movementsCount?.count ?? 0) > 0) {
        return {
          status: "error",
          message: "لا يمكن حذف حساب به حركات مالية نشطة. استخدم الأرشفة بدلاً من ذلك.",
        };
      }

      // حذف حركات الرصيد الافتتاحي المرتبطة بالحساب soft delete
      await tx
        .update(cashMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(cashMovement.accountId, id),
            eq(cashMovement.sourceType, "opening"),
            isNull(cashMovement.deletedAt)
          )
        );

      const [deleted] = await tx
        .update(account)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(account.id, id), isNull(account.deletedAt)))
        .returning();

      if (!deleted) {
        return { status: "error", message: "الحساب غير موجود" };
      }

      revalidatePath("/finance");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getAccounts(): Promise<ActionResponse<Account[]>> {
  try {
    const items = await db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .orderBy(account.createdAt);
    return { status: "ok", data: items };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getAccountBalances(asOfDate?: string): Promise<ActionResponse<{ id: string; name: string; type: string; balanceCents: number; isArchived: boolean }[]>> {
  try {
    const accs = await db
      .select()
      .from(account)
      .where(isNull(account.deletedAt))
      .orderBy(account.createdAt);

    const conditions = [
      isNull(cashMovement.deletedAt)
    ];

    if (asOfDate) {
      conditions.push(sql`${cashMovement.date} <= ${asOfDate}`);
    }

    const movements = await db
      .select({
        accountId: cashMovement.accountId,
        direction: cashMovement.direction,
        total: sum(cashMovement.amountCents),
      })
      .from(cashMovement)
      .where(and(...conditions))
      .groupBy(cashMovement.accountId, cashMovement.direction);

    const balanceMap: Record<string, { in: number; out: number }> = {};
    for (const m of movements) {
      if (!balanceMap[m.accountId]) {
        balanceMap[m.accountId] = { in: 0, out: 0 };
      }
      const val = Number(m.total) || 0;
      if (m.direction === "in") {
        balanceMap[m.accountId].in = val;
      } else if (m.direction === "out") {
        balanceMap[m.accountId].out = val;
      }
    }

    const result = accs.map((acc) => {
      const entry = balanceMap[acc.id] || { in: 0, out: 0 };
      const balanceCents = entry.in - entry.out;
      return {
        id: acc.id,
        name: acc.name,
        type: acc.type,
        balanceCents,
        isArchived: acc.isArchived,
      };
    });

    return { status: "ok", data: result };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function transferBetweenAccounts(
  fromId: string,
  toId: string,
  amountCents: number,
  date: string,
  description?: string,
  requestId?: string
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (fromId === toId) {
    return { status: "error", message: "لا يمكن التحويل إلى نفس الحساب" };
  }

  if (amountCents <= 0) {
    return { status: "error", message: "المبلغ يجب أن يكون أكبر من 0" };
  }

  try {
    return await db.transaction(async (tx) => {
      if (requestId) {
        const [existingKey] = await tx
          .select()
          .from(idempotencyKey)
          .where(eq(idempotencyKey.requestId, requestId));

        if (existingKey) {
          if (existingKey.action === "transfer") {
            return { status: "ok", data: { transferId: existingKey.targetId } };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [fromAcc] = await tx.select().from(account).where(eq(account.id, fromId));
      const [toAcc] = await tx.select().from(account).where(eq(account.id, toId));

      if (!fromAcc || !toAcc) {
        return { status: "error", message: "الحسابات غير موجودة" };
      }

      if (fromAcc.isArchived || toAcc.isArchived) {
        return { status: "error", message: "لا يمكن التحويل من أو إلى حساب مؤرشف" };
      }

      const transferId = crypto.randomUUID();

      // حركة خارجة من المرسل
      await tx.insert(cashMovement).values({
        date,
        accountId: fromId,
        direction: "out",
        amountCents,
        sourceType: "transfer",
        sourceId: transferId,
        description: description || `تحويل مالي إلى حساب: ${toAcc.name}`,
      });

      // حركة داخلة للمستقبل
      await tx.insert(cashMovement).values({
        date,
        accountId: toId,
        direction: "in",
        amountCents,
        sourceType: "transfer",
        sourceId: transferId,
        description: description || `تحويل مالي من حساب: ${fromAcc.name}`,
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "transfer",
          targetId: transferId,
        });
      }

      revalidatePath("/finance");
      return { status: "ok", data: { transferId } };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 7. إجراءات سحوبات المالك (Owner Drawings Actions)
// -------------------------------------------------------------

export async function createOwnerTransaction(
  rawInput: unknown,
  requestId?: string
): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = ownerTransactionInputSchema.safeParse(rawInput);
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
          if (existingKey.action === "owner_transaction") {
            const [ot] = await tx
              .select()
              .from(ownerTransaction)
              .where(eq(ownerTransaction.id, existingKey.targetId));
            return { status: "ok", data: ot };
          }
          return { status: "error", message: "معرف الطلب مستخدم لعملية أخرى" };
        }
      }

      const [newTx] = await tx
        .insert(ownerTransaction)
        .values({
          date: parsed.data.date,
          type: parsed.data.type,
          amountCents: parsed.data.amountCents,
          accountId: parsed.data.accountId,
          reason: parsed.data.reason || "",
        })
        .returning();

      if (!newTx) throw new Error("فشل إدخال معاملة المالك");

      await tx.insert(cashMovement).values({
        date: parsed.data.date,
        accountId: parsed.data.accountId,
        direction: parsed.data.type === "draw" ? "out" : "in",
        amountCents: parsed.data.amountCents,
        sourceType: parsed.data.type === "draw" ? "owner_draw" : "owner_inject",
        sourceId: newTx.id,
        description: parsed.data.reason || (parsed.data.type === "draw" ? `سحوبات شخصية للمالك` : `حقن رأس مال شخصي من المالك`),
      });

      if (requestId) {
        await tx.insert(idempotencyKey).values({
          requestId,
          action: "owner_transaction",
          targetId: newTx.id,
        });
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: newTx };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function getOwnerTransactions(): Promise<ActionResponse<OwnerTransaction[]>> {
  try {
    const list = await db
      .select()
      .from(ownerTransaction)
      .where(isNull(ownerTransaction.deletedAt))
      .orderBy(desc(ownerTransaction.date), desc(ownerTransaction.createdAt));
    return { status: "ok", data: list };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function deleteOwnerTransaction(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    return await db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(ownerTransaction)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(ownerTransaction.id, id), isNull(ownerTransaction.deletedAt)))
        .returning();

      if (!deleted) return { status: "error", message: "المعاملة غير موجودة" };

      // حذف حركة الصندوق المرتبطة
      await tx
        .update(cashMovement)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            sql`${cashMovement.sourceType} in ('owner_draw', 'owner_inject')`,
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 8. إجراءات الأرصدة الافتتاحية (Opening Balance Actions)
// -------------------------------------------------------------

export async function getOpeningBalance(): Promise<ActionResponse<OpeningBalance | null>> {
  try {
    const [row] = await db
      .select()
      .from(openingBalance)
      .where(isNull(openingBalance.deletedAt))
      .limit(1);
    return { status: "ok", data: row || null };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function saveOpeningBalance(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  const parsed = openingBalanceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { goLiveDate, cashCents, bankCents, capitalCents } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [existingLocked] = await tx
        .select()
        .from(openingBalance)
        .where(and(eq(openingBalance.isLocked, true), isNull(openingBalance.deletedAt)))
        .limit(1);

      if (existingLocked) {
        return { status: "error", message: "الإعداد الافتتاحي مقفل ولا يمكن تعديله" };
      }

      // البحث عن حساب الصندوق وحساب البنك الافتراضيين أو إنشاؤهما
      let [cashAcc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.type, "cash"), isNull(account.deletedAt)))
        .limit(1);
      if (!cashAcc) {
        [cashAcc] = await tx
          .insert(account)
          .values({
            name: "الصندوق الرئيسي",
            type: "cash",
            openingBalanceCents: cashCents,
          })
          .returning();
      } else {
        await tx
          .update(account)
          .set({ openingBalanceCents: cashCents, updatedAt: new Date() })
          .where(eq(account.id, cashAcc.id));
      }

      let [bankAcc] = await tx
        .select()
        .from(account)
        .where(and(eq(account.type, "bank"), isNull(account.deletedAt)))
        .limit(1);
      if (!bankAcc) {
        [bankAcc] = await tx
          .insert(account)
          .values({
            name: "حساب البنك الرئيسي",
            type: "bank",
            openingBalanceCents: bankCents,
          })
          .returning();
      } else {
        await tx
          .update(account)
          .set({ openingBalanceCents: bankCents, updatedAt: new Date() })
          .where(eq(account.id, bankAcc.id));
      }

      // حفظ/تحديث سجل opening_balance
      const [existing] = await tx
        .select()
        .from(openingBalance)
        .where(isNull(openingBalance.deletedAt))
        .limit(1);

      let opRow;
      if (existing) {
        [opRow] = await tx
          .update(openingBalance)
          .set({
            goLiveDate,
            cashCents,
            bankCents,
            capitalCents,
            updatedAt: new Date(),
          })
          .where(eq(openingBalance.id, existing.id))
          .returning();
      } else {
        [opRow] = await tx
          .insert(openingBalance)
          .values({
            goLiveDate,
            cashCents,
            bankCents,
            capitalCents,
          })
          .returning();
      }

      // إضافة/تحديث حركات الصندوق للأرصدة الافتتاحية
      // حركة الصندوق
      const [existingCashMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, cashAcc.id),
            eq(cashMovement.sourceType, "opening")
          )
        );

      if (cashCents > 0) {
        if (existingCashMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: cashCents,
              date: goLiveDate,
              deletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingCashMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: goLiveDate,
            accountId: cashAcc.id,
            direction: "in",
            amountCents: cashCents,
            sourceType: "opening",
            description: "رصيد افتتاحي - الصندوق",
          });
        }
      } else {
        if (existingCashMov) {
          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingCashMov.id));
        }
      }

      // حركة البنك
      const [existingBankMov] = await tx
        .select()
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.accountId, bankAcc.id),
            eq(cashMovement.sourceType, "opening")
          )
        );

      if (bankCents > 0) {
        if (existingBankMov) {
          await tx
            .update(cashMovement)
            .set({
              amountCents: bankCents,
              date: goLiveDate,
              deletedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingBankMov.id));
        } else {
          await tx.insert(cashMovement).values({
            date: goLiveDate,
            accountId: bankAcc.id,
            direction: "in",
            amountCents: bankCents,
            sourceType: "opening",
            description: "رصيد افتتاحي - البنك",
          });
        }
      } else {
        if (existingBankMov) {
          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingBankMov.id));
        }
      }

      revalidatePath("/finance");
      revalidatePath("/reports");
      return { status: "ok", data: opRow };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export async function lockOpeningBalance(id: string): Promise<ActionResponse> {
  const { success } = await checkRateLimit();
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  try {
    const [updated] = await db
      .update(openingBalance)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(and(eq(openingBalance.id, id), isNull(openingBalance.deletedAt)))
      .returning();

    if (!updated) {
      return { status: "error", message: "سجل الرصيد الافتتاحي غير موجود" };
    }

    revalidatePath("/finance");
    return { status: "ok", data: updated };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

