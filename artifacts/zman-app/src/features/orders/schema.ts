import { z } from "zod";

/**
 * رقم هاتف اختياري — يُطبَّع إلى سلسلة فارغة `""` عند غيابه، لا إلى `NULL`.
 *
 * لماذا `""` لا `NULL`؟ عمود `order.customer_phone` في قاعدة الإنتاج ما زال
 * `NOT NULL`، و`""` تُحقّق هذا القيد بينما `NULL` تكسره. أي أن جعل الرقم
 * اختيارياً بهذه الطريقة **لا يحتاج أي تعديل على قاعدة البيانات** — لا
 * migration ولا ALTER TABLE. القيد `char_length(...) <= 32` يمرّ أيضاً.
 *
 * `""` هي القيمة الوحيدة التي تعني «لا رقم» في الكود الجديد. الصفوف القديمة
 * قد تحمل `NULL` في العمود البديل (كان nullable من قبل)، فكل قراءة تستعمل
 * `|| ""` أو `hasWhatsAppNumber()` وكلاهما يتعامل مع الاثنتين سواءً بسواء.
 */
const optionalPhone = (tooLongMessage: string) =>
  z
    .string()
    .max(32, tooLongMessage)
    .nullable()
    .optional()
    .transform((val) => (val ?? "").trim());

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
  // D12 fix: حذف حقل `unit` — لم يكن يُpersist أصلاً (order_component ليس له
  // عمود unit). الـ UI يصل للوحدة عبر JOIN من catalog_component عبر
  // catalogComponentId عند الحاجة. حذف الحقل من الـ schema يمنع silently losing
  // البيانات في الجلسة.
});

export const createOrderSchema = z.object({
  requestId: z.string().uuid("معرف الطلب الفريد مطلوب للمطابقة ومنع التكرار"),
  customerName: z
    .string()
    .min(1, "اسم العميل مطلوب")
    .max(200, "اسم العميل طويل جداً"),
  // كلا رقمي الهاتف اختياريان (لا واحد إجباري ولا الاثنان).
  customerPhone: optionalPhone("رقم الهاتف طويل جداً"),
  customerPhoneAlt: optionalPhone("رقم الهاتف البديل طويل جداً"),
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
  // كلا رقمي الهاتف اختياريان (لا واحد إجباري ولا الاثنان).
  customerPhone: optionalPhone("رقم الهاتف طويل جداً"),
  customerPhoneAlt: optionalPhone("رقم الهاتف البديل طويل جداً"),
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
