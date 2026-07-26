import { z } from "zod";

export const orderComponentInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "اسم المكوّن مطلوب").max(200, "اسم المكوّن طويل جداً"),
  costCents: z.number().int().nonnegative("التكلفة يجب أن تكون صفر أو أكثر"),
  // "التكرار في الوحدة": كم مرة يتكرر هذا المكوّن داخل الوحدة الواحدة (الشتلة).
  // إجمالي عدد القطع = quantity × كمية المنتج في الطلب.
  quantity: z
    .number()
    .int()
    .positive("التكرار في الوحدة يجب أن يكون أكبر من صفر"),
  // الربط المفقود (المرحلة 1): معرّف صنف الكتالوج إن اختير من الـ picker.
  // اختياري لأن الإضافة اليدوية لا تحمل id (نص حر). يُمرَّر null للـ DB
  // في orders/actions.ts إن لم يُحدَّد. Phase 3 تستخدمه لخصم المخزون.
  catalogComponentId: z.string().uuid().optional(),
  // Phase 3 (card 3.K) — snapshot الوحدة من الكتالوج وقت الاختيار. للأرشفة
  // والعرض في بطاقة المكوّن. لا يُستخدم في الخصم — الخصم يستخدم catalogComponentId.
  unit: z.string().max(32).optional(),
});

export const createOrderSchema = z.object({
  requestId: z.string().uuid("معرف الطلب الفريد مطلوب للمطابقة ومنع التكرار"),
  customerName: z
    .string()
    .min(1, "اسم العميل مطلوب")
    .max(200, "اسم العميل طويل جداً"),
  customerPhone: z
    .string()
    .min(1, "رقم الهاتف مطلوب")
    .max(32, "رقم الهاتف طويل جداً"),
  customerPhoneAlt: z
    .string()
    .max(32, "رقم الهاتف البديل طويل جداً")
    .nullable()
    .optional(),
  productName: z
    .string()
    .min(1, "اسم المنتج مطلوب")
    .max(200, "اسم المنتج طويل جداً"),
  quantity: z.number().int().positive("الكمية يجب أن تكون أكبر من صفر"),
  components: z.array(orderComponentInputSchema),
  additionalCostsCents: z
    .number()
    .int()
    .nonnegative("التكاليف الإضافية يجب أن تكون صفر أو أكثر")
    .default(0),
  totalPriceCents: z
    .number()
    .int()
    .nonnegative("السعر الإجمالي يجب أن يكون صفر أو أكثر"),
  notes: z.string().max(1000, "الملاحظات طويلة جداً").optional().default(""),
  deliveryDate: z.string().nullable().optional(),
  receivedDate: z.string().optional(),
  depositCents: z
    .number()
    .int()
    .nonnegative("العربون يجب أن يكون صفر أو أكثر")
    .default(0),
  depositDate: z.string().nullable().optional(),
  // التوصيل: رقم واحد مسجّل للتوثيق فقط — لا يدخل أي حساب. أي ربح من فرق
  // التوصيل يُسجَّل يدوياً ضمن "الأرباح الإضافية".
  deliveryPaidCents: z
    .number()
    .int()
    .nonnegative("مبلغ التوصيل يجب أن يكون صفر أو أكثر")
    .default(0),
  // أرباح إضافية: ربح جانبي يُضاف إلى صافي الربح (مرة واحدة، لا يُضرب في الكمية).
  additionalProfitCents: z
    .number()
    .int()
    .nonnegative("الأرباح الإضافية يجب أن تكون صفر أو أكثر")
    .default(0),
}).refine((data) => data.depositCents <= data.totalPriceCents + (data.additionalProfitCents ?? 0), {
  message: "العربون لا يمكن أن يتجاوز السعر الإجمالي + الأرباح الإضافية",
  path: ["depositCents"],
});

export const updateOrderSchema = z.object({
  id: z.string().uuid("معرف الطلب غير صالح"),
  updatedAt: z.union([z.string(), z.date()]).transform((val) =>
    val instanceof Date ? val.toISOString() : val
  ),
  customerName: z
    .string()
    .min(1, "اسم العميل مطلوب")
    .max(200, "اسم العميل طويل جداً"),
  customerPhone: z
    .string()
    .min(1, "رقم الهاتف مطلوب")
    .max(32, "رقم الهاتف طويل جداً"),
  customerPhoneAlt: z
    .string()
    .max(32, "رقم الهاتف البديل طويل جداً")
    .nullable()
    .optional(),
  productName: z
    .string()
    .min(1, "اسم المنتج مطلوب")
    .max(200, "اسم المنتج طويل جداً"),
  quantity: z.number().int().positive("الكمية يجب أن تكون أكبر من صفر"),
  components: z.array(orderComponentInputSchema),
  additionalCostsCents: z
    .number()
    .int()
    .nonnegative("التكاليف الإضافية يجب أن تكون صفر أو أكثر")
    .default(0),
  totalPriceCents: z
    .number()
    .int()
    .nonnegative("السعر الإجمالي يجب أن يكون صفر أو أكثر"),
  notes: z.string().max(1000, "الملاحظات طويلة جداً").optional().default(""),
  deliveryDate: z.string().nullable().optional(),
  receivedDate: z.string().optional(),
  depositCents: z
    .number()
    .int()
    .nonnegative("العربون يجب أن يكون صفر أو أكثر")
    .default(0),
  depositDate: z.string().nullable().optional(),
  // التوصيل: رقم واحد مسجّل للتوثيق فقط — لا يدخل أي حساب. أي ربح من فرق
  // التوصيل يُسجَّل يدوياً ضمن "الأرباح الإضافية".
  deliveryPaidCents: z
    .number()
    .int()
    .nonnegative("مبلغ التوصيل يجب أن يكون صفر أو أكثر")
    .default(0),
  // أرباح إضافية: ربح جانبي يُضاف إلى صافي الربح (مرة واحدة، لا يُضرب في الكمية).
  additionalProfitCents: z
    .number()
    .int()
    .nonnegative("الأرباح الإضافية يجب أن تكون صفر أو أكثر")
    .default(0),
}).refine((data) => data.depositCents <= data.totalPriceCents + (data.additionalProfitCents ?? 0), {
  message: "العربون لا يمكن أن يتجاوز السعر الإجمالي + الأرباح الإضافية",
  path: ["depositCents"],
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type OrderComponentInput = z.infer<typeof orderComponentInputSchema>;
