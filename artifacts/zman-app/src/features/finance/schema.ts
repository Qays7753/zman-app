import { z } from "zod";

// 1. مخطط التحقق للمشتريات
export const purchaseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  item: z
    .string()
    .min(1, { message: "البيان مطلوب" })
    .max(200, { message: "البيان لا يتعدى 200 حرف" }),
  supplier: z
    .string()
    .max(200, { message: "اسم المورد لا يتعدى 200 حرف" })
    .optional()
    .default(""),
  quantity: z.coerce
    .number()
    .int({ message: "الكمية يجب أن تكون عدداً صحيحاً" })
    .positive({ message: "الكمية يجب أن تكون أكبر من 0" }),
  // سعر الوحدة عالي الدقّة بالميلي-fils (fils×1000). هو المصدر الأساسي المُرسَل
  // من الواجهة. يضمن أن (فردي × كمية = إجمالي) دون فقدان الكسر.
  unitCostMicroCents: z.coerce
    .number()
    .int({ message: "التكلفة يجب أن تكون عدداً صحيحاً" })
    .positive({ message: "التكلفة يجب أن تكون أكبر من 0" }),
  notes: z
    .string()
    .max(1000, { message: "الملاحظات لا تتعدى 1000 حرف" })
    .optional()
    .default(""),
  // Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر).
  // isCapitalAsset: افتراضي false (كل شراء تشغيلي ما لم يُحدَّد خلافه).
  // costNature: اختياري — NULL مقبول في الـ DB للرأسمالي وللصفوف القديمة.
  // عند isCapitalAsset=false يُفضَّل تحديده (defaultValues في الـ form تضع 'variable').
  isCapitalAsset: z.boolean().default(false),
  costNature: z.enum(["fixed", "variable"]).optional(),
  // Phase 3 — ربط اختياري بصنف الكتالوج المتتبَّع (card 3.A/3.H/3.J).
  // nullable + optional: undefined (لم يُحدَّد) → null في الـ DB. null (صريح) → لا ربط.
  // createPurchase/updatePurchase تتحقق من tracked=true قبل إدراج حركة المخزون؛
  // فإن كان غير متتبَّع، ترمي transaction بخطأ "الصنف غير متتبَّع أو غير موجود".
  linkedCatalogComponentId: z.string().uuid().optional().nullable(),
});

// 2. مخطط التحقق للمصاريف
export const expenseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  category: z
    .string()
    .min(1, { message: "الفئة مطلوبة" })
    .max(200, { message: "الفئة لا تتعدى 200 حرف" }),
  amountCents: z.coerce
    .number()
    .int({ message: "المبلغ يجب أن يكون عدداً صحيحاً" })
    .positive({ message: "المبلغ يجب أن يكون أكبر من 0" }),
  description: z
    .string()
    .max(1000, { message: "الوصف لا يتعدى 1000 حرف" })
    .optional()
    .default(""),
  // Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر). نفس منطق purchase.
  isCapitalAsset: z.boolean().default(false),
  costNature: z.enum(["fixed", "variable"]).optional(),
});

export const saleInputSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
    }),
    source: z.enum(["manual", "order"], { message: "المصدر غير صالح" }),
    orderId: z
      .string()
      .uuid({ message: "معرف الطلب غير صالح" })
      .nullable()
      .optional(),
    amountCents: z.coerce
      .number()
      .int({ message: "المبلغ يجب أن يكون عدداً صحيحاً" })
      .nonnegative({ message: "المبلغ لا يمكن أن يكون سالباً" }),
    description: z
      .string()
      .max(1000, { message: "الوصف لا يتعدى 1000 حرف" })
      .optional()
      .default(""),
  })
  .refine(
    (data) => {
      if (data.source === "order") {
        return data.orderId !== null && data.orderId !== undefined;
      }
      return true;
    },
    {
      message: "معرف الطلب مطلوب عندما يكون مصدر البيع مرتبط بطلب",
      path: ["orderId"],
    },
  );

// 4. مخطط التحقق لرد أموال عربون الطلب — مسار مستقل عن عكس التسليم.
export const refundOrderInputSchema = z.object({
  orderId: z.string().uuid({ message: "معرف الطلب غير صالح" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  amountCents: z.coerce
    .number()
    .int({ message: "مبلغ الرد يجب أن يكون عدداً صحيحاً" })
    .positive({ message: "مبلغ الرد يجب أن يكون أكبر من 0" }),
  accountId: z.string().uuid({ message: "الحساب المالي غير صالح" }),
  notes: z
    .string()
    .max(1000, { message: "الملاحظات لا تتعدى 1000 حرف" })
    .optional()
    .default(""),
});

// 5. مخطط التحقق للحسابات
export const accountInputSchema = z.object({
  name: z
    .string()
    .min(1, { message: "اسم الحساب مطلوب" })
    .max(200, { message: "الاسم لا يتعدى 200 حرف" }),
  type: z.enum(["cash", "bank"], { message: "نوع الحساب غير صالح" }),
  openingSeedCents: z.coerce
    .number()
    .int({ message: "الرصيد الافتتاحي يجب أن يكون صحيحاً" })
    .nonnegative({ message: "الرصيد الافتتاحي لا يمكن أن يكون سالباً" }),
});

// 5. مخطط التحقق لسحوبات وحقن المالك
export const ownerTransactionInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  type: z.enum(["draw", "inject"], { message: "النوع غير صالح" }),
  amountCents: z.coerce
    .number()
    .int({ message: "المبلغ يجب أن يكون صحيحاً" })
    .positive({ message: "المبلغ يجب أن يكون أكبر من 0" }),
  accountId: z.string().uuid({ message: "الحساب المالي غير صالح" }),
  reason: z
    .string()
    .max(1000, { message: "السبب لا يتعدى 1000 حرف" })
    .optional()
    .default(""),
});

// 6. مخطط التحقق للأرصدة الافتتاحية
export const openingBalanceInputSchema = z.object({
  goLiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  cashCents: z.coerce
    .number()
    .int({ message: "المبلغ النقد في الصندوق يجب أن يكون صحيحاً" })
    .nonnegative({ message: "المبلغ لا يمكن أن يكون سالباً" }),
  bankCents: z.coerce
    .number()
    .int({ message: "المبلغ النقد في البنك يجب أن يكون صحيحاً" })
    .nonnegative({ message: "المبلغ لا يمكن أن يكون سالباً" }),
  capitalCents: z.coerce
    .number()
    .int({ message: "رأس المال الافتتاحي يجب أن يكون صحيحاً" })
    .nonnegative({ message: "المبلغ لا يمكن أن يكون سالباً" }),
});

// 7. مخطط التحقق للذمم المدينة (الديون النقدية للأشخاص)
export const receivableInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  personName: z
    .string()
    .min(1, { message: "اسم الشخص مطلوب" })
    .max(200, { message: "اسم الشخص لا يتعدى 200 حرف" }),
  amountCents: z.coerce
    .number()
    .int({ message: "المبلغ يجب أن يكون عدداً صحيحاً" })
    .positive({ message: "المبلغ يجب أن يكون أكبر من 0" }),
  accountId: z.string().uuid({ message: "الحساب المالي غير صالح" }),
  notes: z
    .string()
    .max(1000, { message: "الملاحظات لا تتعدى 1000 حرف" })
    .optional()
    .default(""),
});

// 8. مخطط التحقق لسداد الديون النقدية
export const receivablePaymentInputSchema = z.object({
  receivableId: z.string().uuid({ message: "معرف الذمة غير صالح" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "التاريخ يجب أن يكون بتنسيق YYYY-MM-DD",
  }),
  amountCents: z.coerce
    .number()
    .int({ message: "مبلغ الدفعة يجب أن يكون عدداً صحيحاً" })
    .positive({ message: "مبلغ الدفعة يجب أن يكون أكبر من 0" }),
  accountId: z.string().uuid({ message: "الحساب المالي غير صالح" }),
  notes: z
    .string()
    .max(1000, { message: "الملاحظات لا تتعدى 1000 حرف" })
    .optional()
    .default(""),
});

