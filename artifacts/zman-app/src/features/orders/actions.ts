"use server";

import { and, eq, isNull, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { idempotencyKey, order, orderComponent, messageTemplate } from "./db";
import { createOrderSchema, updateOrderSchema } from "./schema";
import { sale, cashMovement } from "../finance/db";
import { getOrCreateDefaultCashAccount } from "../finance/actions";
import { getAmmanDate } from "@/lib/utils";

// نوع الإرجاع الموحد (Discriminated Union) (§18 rule 8)
type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

/**
 * إجراء إنشاء طلب جديد مع معالجة التكرار والـ rate limit (§5.6)
 */
export async function createOrder(rawInput: unknown): Promise<ActionResponse> {
  // 1. فحص الـ Rate Limit (§15.15)
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  // 2. التحقق من المدخلات باستخدام Zod (§18 rule 8)
  const parsed = createOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      if (value) fieldErrors[key] = value;
    }
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors,
    };
  }

  const {
    requestId,
    customerName,
    customerPhone,
    customerPhoneAlt,
    productName,
    quantity,
    components,
    additionalCostsCents,
    totalPriceCents,
    notes,
    deliveryDate,
    receivedDate,
    depositCents,
    depositDate,
    deliveryPaidCents,
    additionalProfitCents,
  } = parsed.data;

  if (depositCents > totalPriceCents + (additionalProfitCents ?? 0)) {
    return {
      status: "error",
      message: "العربون لا يمكن أن يتجاوز السعر الإجمالي + الأرباح الإضافية",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 3. فحص الـ Idempotency لمنع التكرار (§5.6)
      const existingKey = await tx
        .select()
        .from(idempotencyKey)
        .where(eq(idempotencyKey.requestId, requestId))
        .limit(1);

      if (existingKey.length > 0 && existingKey[0]) {
        // إذا كان الطلب منشأ مسبقاً، نرجعه مباشرة — لكن فقط إن لم يُحذف ناعماً.
        // (إلا فإن إعادة المحاولة بعد الحذف تُرجع صفّاً محذوفاً كأنه نجاح.)
        const [existingOrder] = await tx
          .select()
          .from(order)
          .where(and(eq(order.id, existingKey[0].targetId), isNull(order.deletedAt)))
          .limit(1);
        if (existingOrder) {
          return { status: "ok", data: existingOrder };
        }
      }

      // 4. احتساب إجمالي التكلفة (§5.5).
      //    كمية المكوّن هي "تكرار في الوحدة"، فتكلفة الوحدة الواحدة = Σ(تكلفة×تكرار)،
      //    وتكلفة المكوّنات الكلية = تكلفة الوحدة × كمية المنتج.
      const unitComponentsCostCents = components.reduce(
        (sum, c) => sum + c.costCents * c.quantity,
        0,
      );
      const componentsCostCents = unitComponentsCostCents * quantity;
      const totalCostCents = componentsCostCents + (additionalCostsCents ?? 0);

      // 5. إدراج الطلب الرئيسي
      const [newOrder] = await tx
        .insert(order)
        .values({
          customerName,
          customerPhone,
          customerPhoneAlt: customerPhoneAlt || null,
          productName,
          quantity,
          totalCostCents,
          additionalCostsCents: additionalCostsCents ?? 0,
          totalPriceCents,
          notes: notes ?? "",
          status: "draft",
          deliveryDate: deliveryDate || null,
          receivedDate: receivedDate || getAmmanDate(),
          depositCents: depositCents ?? 0,
          depositDate: depositDate || null,
          deliveryPaidCents: deliveryPaidCents ?? 0,
          additionalProfitCents: additionalProfitCents ?? 0,
        })
        .returning();

      if (!newOrder) {
        throw new Error("فشل إنشاء الطلب");
      }

      // 5.1. إدراج حركة صندوق للعربون إذا وجد (التزاماً بـ §3)
      if (newOrder.depositCents > 0) {
        const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
        await tx.insert(cashMovement).values({
          // date في cash_movement هو NOT NULL بلا default — نضمن قيمة دائماً
          date: newOrder.depositDate || newOrder.receivedDate || getAmmanDate(),
          accountId: defaultAccountId,
          direction: "in",
          amountCents: newOrder.depositCents,
          sourceType: "deposit",
          sourceId: newOrder.id,
          description: `عربون طلب - منتج: ${newOrder.productName}`,
        });
      }

      // 6. إدراج المكونات الفرعية
      if (components.length > 0) {
        await tx.insert(orderComponent).values(
          components.map((c) => ({
            orderId: newOrder.id,
            name: c.name,
            costCents: c.costCents,
            quantity: c.quantity,
          })),
        );
      }

      // 7. تسجيل مفتاح التكرار
      await tx.insert(idempotencyKey).values({
        requestId,
        action: "create_order",
        targetId: newOrder.id,
      });

      revalidatePath("/orders");
      return { status: "ok", data: newOrder };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

/**
 * إجراء تعديل طلب قائم مع التحقق من التزامن وقفل الصف (§5.6)
 */
export async function updateOrder(rawInput: unknown): Promise<ActionResponse> {
  // 1. فحص الـ Rate Limit
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  // 2. التحقق من المدخلات
  const parsed = updateOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(
      parsed.error.flatten().fieldErrors,
    )) {
      if (value) fieldErrors[key] = value;
    }
    return {
      status: "error",
      message: "بيانات الإدخال غير صالحة",
      fieldErrors,
    };
  }

  const {
    id,
    updatedAt,
    customerName,
    customerPhone,
    customerPhoneAlt,
    productName,
    quantity,
    components,
    additionalCostsCents,
    totalPriceCents,
    notes,
    deliveryDate,
    receivedDate,
    depositCents,
    depositDate,
    deliveryPaidCents,
    additionalProfitCents,
  } = parsed.data;

  if (depositCents > totalPriceCents + (additionalProfitCents ?? 0)) {
    return {
      status: "error",
      message: "العربون لا يمكن أن يتجاوز السعر الإجمالي + الأرباح الإضافية",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 3. قفل الصف للطلب الرئيسي لمنع السباق المالي (§5.6)
      const [existing] = await tx
        .select()
        .from(order)
        .where(eq(order.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "الطلب غير موجود" };
      }

      // 4. التحقق من التزامن المتفائل (§5.6)
      const clientDate = new Date(updatedAt).getTime();
      const dbDate = new Date(existing.updatedAt).getTime();
      if (clientDate !== dbDate) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      // 5. احتساب إجمالي التكلفة (§5.5). كمية المكوّن = تكرار في الوحدة،
      //    فتكلفة المكوّنات الكلية = Σ(تكلفة×تكرار) × كمية المنتج.
      const unitComponentsCostCents = components.reduce(
        (sum, c) => sum + c.costCents * c.quantity,
        0,
      );
      const componentsCostCents = unitComponentsCostCents * quantity;
      const totalCostCents = componentsCostCents + (additionalCostsCents ?? 0);

      // حرج: امنع تعديل العربون على طلب مُسلَّم قبل أي كتابة. العربون تحوّل إلى إيراد
      // مبيعات عند التسليم؛ فصله يتطلب عكس التحويل. نُرجع الخطأ قبل الكتابة لأن
      // db.transaction في Drizzle يلتزم عند العودة الطبيعية (لا يُلغى إلا بـ throw).
      if (
        existing.status === "delivered" &&
        (depositCents ?? 0) !== existing.depositCents
      ) {
        return {
          status: "error",
          message:
            "لا يمكن تعديل العربون على طلب مُسلَّم. العربون تحوّل إلى إيراد مبيعات عند التسليم. لعكس ذلك، احذف المبيعة المرتبطة أولاً ثم أعد التحويل.",
        };
      }

      // 6. تحديث الطلب مع شروط الأمان والتزامن المتفائل
      const [updatedOrder] = await tx
        .update(order)
        .set({
          customerName,
          customerPhone,
          customerPhoneAlt: customerPhoneAlt || null,
          productName,
          quantity,
          totalCostCents,
          additionalCostsCents: additionalCostsCents ?? 0,
          totalPriceCents,
          notes: notes ?? "",
          deliveryDate: deliveryDate || null,
          receivedDate: receivedDate || getAmmanDate(),
          deliveryPaidCents: deliveryPaidCents ?? 0,
          additionalProfitCents: additionalProfitCents ?? 0,
          // للطلبات الملغاة: لا نحتفظ بعربون في صف الطلب (لا حركة نقدية مطابقة)
          depositCents: existing.status === "cancelled" ? 0 : (depositCents ?? 0),
          depositDate: existing.status === "cancelled" ? null : (depositDate || null),
          updatedAt: new Date(),
        })
        .where(eq(order.id, id))
        .returning();

      if (!updatedOrder) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      // 6.1. تحديث حركة صندوق العربون أو إدراجها/حذفها حسب التغيير.
      // حرج: لا نُنشئ أو نُحدّث حركة عربون للطلبات المُسلَّمة أو الملغاة.
      //   - للملغى: لا يوجد عربون نشط أصلاً (تم حذفه عند الإلغاء).
      //   - للمُسلَّم: العربون تحوّل إلى sale عند التحويل (convertOrderToSale)،
      //     فلا توجد حركة deposit نشطة. لو أنشأنا واحدة جديدة، ستُعلَّق كمخالفة
      //     IC-3 (عربون قديم على طلب مُسلَّم). تعديل العربون على طلب مُسلَّم
      //     ممنوع — يجب عكس البيع أولاً.
      if (existing.status !== "cancelled" && existing.status !== "delivered") {
        const [existingDepositMov] = await tx
          .select()
          .from(cashMovement)
          .where(
            and(
              eq(cashMovement.sourceType, "deposit"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt)
            )
          );

        const movDate = depositDate || receivedDate || getAmmanDate();
        if (depositCents > 0) {
          const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
          if (existingDepositMov) {
            await tx
              .update(cashMovement)
              .set({
                amountCents: depositCents,
                date: movDate,
                accountId: defaultAccountId,
                description: `عربون طلب - منتج: ${productName}`,
                updatedAt: new Date(),
              })
              .where(eq(cashMovement.id, existingDepositMov.id));
          } else {
            await tx.insert(cashMovement).values({
              date: movDate,
              accountId: defaultAccountId,
              direction: "in",
              amountCents: depositCents,
              sourceType: "deposit",
              sourceId: id,
              description: `عربون طلب - منتج: ${productName}`,
            });
          }
        } else if (existingDepositMov) {
          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(cashMovement.id, existingDepositMov.id));
        }
      }

      // 6.2. مزامنة حركة البيع إن كان الطلب محوّلاً لمبيعة نشطة. حرج: بعد
      // تحويل العربون إلى sale، يجب أن يبقى مجموع حركات sale المرتبطة بالمبيعة
      // = totalPriceCents + additionalProfitCents (الإيراد المحقَّق الكامل).
      //   - حركة "محوَّلة من عربون" قيمتها = depositCents (لا تُمَس).
      //   - حركة "المتبقي" قيمتها = realizedSaleCents - depositCents.
      // عند تعديل السعر أو الأرباح الإضافية، نُحدّث المتبقي فقط.
      const [linkedSale] = await tx
        .select({ id: sale.id })
        .from(sale)
        .where(and(eq(sale.orderId, id), isNull(sale.deletedAt)));

      if (linkedSale) {
        const realizedSaleCents =
          totalPriceCents + (additionalProfitCents ?? 0);

        // حدّث مبلغ المبيعة نفسها ليطابق الإيراد المحقَّق الكامل
        await tx
          .update(sale)
          .set({ amountCents: realizedSaleCents, updatedAt: new Date() })
          .where(eq(sale.id, linkedSale.id));

        // ابحث عن حركة المتبقي فقط — ميزها عن حركة العربون المحوَّلة بوصفها
        // لا تحتوي على "(محوَّل من عربون)" في الوصف.
        const saleMovs = await tx
          .select()
          .from(cashMovement)
          .where(
            and(
              eq(cashMovement.sourceType, "sale"),
              eq(cashMovement.sourceId, linkedSale.id),
              eq(cashMovement.direction, "in"),
              isNull(cashMovement.deletedAt),
            ),
          );

        const transformedMov = saleMovs.find((m) =>
          (m.description ?? "").includes("محوَّل من عربون"),
        );
        const remainderMov = saleMovs.find(
          (m) => !(m.description ?? "").includes("محوَّل من عربون"),
        );

        const newRemainderCents = Math.max(
          0,
          realizedSaleCents - (existing.depositCents ?? 0),
        );

        if (newRemainderCents > 0) {
          const defaultAccountId = await getOrCreateDefaultCashAccount(tx);
          if (remainderMov) {
            await tx
              .update(cashMovement)
              .set({
                amountCents: newRemainderCents,
                accountId: defaultAccountId,
                updatedAt: new Date(),
              })
              .where(eq(cashMovement.id, remainderMov.id));
          } else {
            await tx.insert(cashMovement).values({
              date: receivedDate || getAmmanDate(),
              accountId: defaultAccountId,
              direction: "in",
              amountCents: newRemainderCents,
              sourceType: "sale",
              sourceId: linkedSale.id,
              description: `متبقي مبيعات الطلب #${id.slice(0, 8)}`,
            });
          }
        } else if (remainderMov) {
          await tx
            .update(cashMovement)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(cashMovement.id, remainderMov.id));
        }
        // transformedMov (العربون المحوَّل) لا يُمَس — قيمته = depositCents
        // الثابتة عند التحويل، ولا تتغير إلا بعكس التحويل (reverseSale).
        // لعكس البيع بطريقة نظيفة: استخدم reverseSale (finance/actions.ts)
        // التي تُعيد تصنيف حركة العربون إلى deposit وتحذف المتبقي والمبيعة.
        void transformedMov;
      }

      // 7. تحديث المكونات الفرعية: حذف القديم وإعادة إدخال الجديد داخل المعاملة
      await tx.delete(orderComponent).where(eq(orderComponent.orderId, id));
      if (components.length > 0) {
        await tx.insert(orderComponent).values(
          components.map((c) => ({
            orderId: id,
            name: c.name,
            costCents: c.costCents,
            quantity: c.quantity,
          })),
        );
      }

      revalidatePath("/orders");
      revalidatePath(`/orders/${id}`);
      return { status: "ok", data: updatedOrder };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

/**
 * إجراء الحذف اللطيف (Soft Delete) للطلب مع قفل الصف والتحقق من التزامن (§5.6)
 */
export async function deleteOrder(
  id: string,
  updatedAt: string,
): Promise<ActionResponse> {
  // 1. فحص الـ Rate Limit
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return {
      status: "error",
      message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 2. قفل الصف
      const [existing] = await tx
        .select()
        .from(order)
        .where(eq(order.id, id))
        .for("update");

      if (!existing) {
        return { status: "error", message: "الطلب غير موجود" };
      }

      // منع حذف الطلبات المُسلَّمة — لها أثر مالي محقَّق (مبيعة + حركات صندوق).
      // حذفها يدمر السجل المالي. لعكس طلب مُسلَّم، استخدم تدفق الإشعارات
      // الائتمانية (حذف المبيعة المرتبطة يحذف حركاتها النقدية، ثم يمكن إعادة
      // التحويل إن لزم).
      if (existing.status === "delivered") {
        return {
          status: "error",
          message:
            "لا يمكن حذف طلب مُسلَّم. له أثر مالي محقَّق. لعكسه، احذف المبيعة المرتبطة من صفحة المالية أولاً.",
        };
      }

      // 3. فحص التزامن المتفائل
      const clientDate = new Date(updatedAt).getTime();
      const dbDate = new Date(existing.updatedAt).getTime();
      if (clientDate !== dbDate) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      // 4. إجراء الحذف اللطيف (تعيين deleted_at) (§5.1)
      const [deleted] = await tx
        .update(order)
        .set({
          deletedAt: new Date(),
        })
        .where(eq(order.id, id))
        .returning();

      if (!deleted) {
        return {
          status: "error",
          message: "تم تحديث البيانات من جهة أخرى",
        };
      }

      // 4.1. حذف المبيعات المرتبطة وحركات الصندوق المرتبطة بها لعدم تضخيم النقدية (FIX-B)
      const linkedSales = await tx
        .select({ id: sale.id })
        .from(sale)
        .where(and(eq(sale.orderId, id), isNull(sale.deletedAt)));

      const saleIds = linkedSales.map((s) => s.id);

      if (saleIds.length > 0) {
        await tx
          .update(sale)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sale.orderId, id));

        await tx
          .update(cashMovement)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cashMovement.sourceType, "sale"),
              inArray(cashMovement.sourceId, saleIds),
              isNull(cashMovement.deletedAt)
            )
          );
      }

      // 4.2. حذف حركة عربون الطلب أيضاً
      await tx
        .update(cashMovement)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cashMovement.sourceType, "deposit"),
            eq(cashMovement.sourceId, id),
            isNull(cashMovement.deletedAt)
          )
        );

      revalidatePath("/orders");
      return { status: "ok", data: deleted };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// الحالات المسموح بها وترتيب الانتقال
const VALID_STATUSES = ["draft", "sent", "confirmed", "delivered", "cancelled"] as const;
type OrderStatus = (typeof VALID_STATUSES)[number];

/**
 * تحديث حالة الطلب مع التحقق من التزامن المتفائل (§5.6)
 */
export async function updateOrderStatus(
  id: string,
  newStatus: string,
  updatedAt: string,
): Promise<ActionResponse> {
  // 1. فحص الـ Rate Limit
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح — حاول بعد دقيقة" };
  }

  // 2. التحقق من الحالة المطلوبة
  if (!(VALID_STATUSES as readonly string[]).includes(newStatus)) {
    return { status: "error", message: "حالة غير صالحة" };
  }

  // 2.5. منع الانتقال المباشر إلى "تم التوصيل" عبر هذا المسار — يجب أن يمرّ
  // عبر convertOrderToSale (ينشئ سجل المبيعات ويرحّل المتبقّي للصندوق)،
  // وإلا يبقى الطلب delivered بمبيعات صفرية.
  if (newStatus === "delivered") {
    return {
      status: "error",
      message: "لتأكيد التوصيل، استخدم زر «تحويل إلى مبيعات» ليُسجَّل الإيراد.",
    };
  }

  try {
    return await db.transaction(async (tx) => {
      // 3. قفل الصف
      const [existing] = await tx
        .select()
        .from(order)
        .where(and(eq(order.id, id), isNull(order.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "الطلب غير موجود" };

      // 4. فحص التزامن المتفائل
      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
      }

      // 4.5. منع إعادة فتح الطلبات الملغاة (P0-2)
      if (existing.status === "cancelled" && newStatus !== "cancelled") {
        return {
          status: "error",
          message: "لا يمكن إعادة فتح طلب ملغى. أنشئ طلباً جديداً بدلاً من ذلك.",
        };
      }

      // 4.6. منع إلغاء الطلبات المُسلَّمة — لها أثر مالي محقَّق (مبيعة محقَّقة).
      // إلغاؤها يفترض استرداداً كاملاً من العميل ويدمر السجل. لعكس بيع مُسلَّم،
      // استخدم reverseSale (عكس البيع).
      if (existing.status === "delivered" && newStatus === "cancelled") {
        return {
          status: "error",
          message:
            "لا يمكن إلغاء طلب مُسلَّم. استخدم «عكس البيع» لإرجاعه لتحت التنفيذ.",
        };
      }

      // Task 5: منع مغادرة حالة "delivered" عبر updateOrderStatus الخام.
      // يجب استخدام reverseSale لعكس البيع بشكل مالي صحيح.
      if (existing.status === "delivered" && newStatus !== "delivered") {
        return {
          status: "error",
          message:
            "لا يمكن تغيير حالة طلب مُسلَّم مباشرةً. استخدم «عكس البيع» لإرجاعه لتحت التنفيذ أولاً.",
        };
      }

      // Task 5: Self-heal — إذا كان status ≠ 'delivered' لكن توجد مبيعة نشطة مرتبطة،
      // ارفض التغيير لمنع الطلب من أن يصبح "مؤكد" بينما بيعه لا يزال نشطاً.
      if (newStatus !== "delivered" && existing.status !== "delivered") {
        const [activeSale] = await tx
          .select({ id: sale.id })
          .from(sale)
          .where(and(eq(sale.orderId, id), isNull(sale.deletedAt)))
          .limit(1);
        if (activeSale) {
          return {
            status: "error",
            message:
              "هذا الطلب لديه مبيعة نشطة مسجَّلة. استخدم «عكس البيع» من صفحة الطلب أولاً.",
          };
        }
      }

      // 5. تحديث الحالة
      const [updated] = await tx
        .update(order)
        .set({
          status: newStatus as OrderStatus,
          // إذا أصبحت الحالة ملغاة: صفّر العربون في جدول الطلبات ليتناسق مع حذف حركة النقدية
          ...(newStatus === "cancelled" ? { depositCents: 0, depositDate: null } : {}),
        })
        .where(eq(order.id, id))
        .returning();

      if (!updated) {
        return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
      }

      if (newStatus === "cancelled") {
        const linkedSales = await tx
          .select({ id: sale.id })
          .from(sale)
          .where(and(eq(sale.orderId, id), isNull(sale.deletedAt)));

        const saleIds = linkedSales.map((s) => s.id);

        if (saleIds.length > 0) {
          await tx
            .update(sale)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sale.orderId, id));

          await tx
            .update(cashMovement)
            .set({
              deletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(cashMovement.sourceType, "sale"),
                inArray(cashMovement.sourceId, saleIds),
                isNull(cashMovement.deletedAt)
              )
            );
        }

        // إرجاع كاش العربون أيضاً
        await tx
          .update(cashMovement)
          .set({
            deletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cashMovement.sourceType, "deposit"),
              eq(cashMovement.sourceId, id),
              isNull(cashMovement.deletedAt)
            )
          );
      }

      revalidatePath("/orders");
      revalidatePath(`/orders/${id}`);
      return { status: "ok", data: updated };
    });
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

// -------------------------------------------------------------
// 8. قالب الرسالة المخصصة (WhatsApp Message Template Actions)
// -------------------------------------------------------------

export async function getMessageTemplate(): Promise<string> {
  try {
    const [existing] = await db
      .select()
      .from(messageTemplate)
      .where(eq(messageTemplate.key, "customer_confirmation"))
      .limit(1);

    if (existing) {
      return existing.template;
    }

    return `مرحباً سيد/ة {customerName}،

يسعدنا تأكيد تفاصيل طلبك كالتالي:
- المنتج: {productName}
- الكمية: {quantity}
- السعر الإجمالي: {totalPrice}
{notes}
شكراً لثقتك بنا وتعاملك معنا!`;
  } catch (error) {
    console.error("Failed to fetch message template:", error);
    return "";
  }
}

export async function updateMessageTemplate(template: string): Promise<ActionResponse<string>> {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return { status: "error", message: "تجاوزت الحد المسموح للعمليات — حاول بعد دقيقة" };
  }

  if (!template || template.trim().length === 0) {
    return { status: "error", message: "محتوى القالب مطلوب" };
  }
  if (template.length > 5000) {
    return { status: "error", message: "محتوى القالب طويل جداً" };
  }

  try {
    await db
      .insert(messageTemplate)
      .values({
        key: "customer_confirmation",
        template: template,
      })
      .onConflictDoUpdate({
        target: messageTemplate.key,
        set: {
          template: template,
          updatedAt: new Date(),
        },
      });

    revalidatePath("/orders");
    return { status: "ok", data: template };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}
