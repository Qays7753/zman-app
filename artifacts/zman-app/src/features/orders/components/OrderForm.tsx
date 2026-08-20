"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { TextField } from "@/components/shared/TextField";
import { assertOnline } from "@/lib/online";
import type { CreateOrderInput, UpdateOrderInput } from "../schema";
import { createOrderSchema, updateOrderSchema } from "../schema";
import type { OrderWithComponents } from "../types";
import { ComponentsEditor } from "./ComponentsEditor";
import { useCreateOrder, useUpdateOrder } from "../hooks";
// Phase 3 — جلب رصيد الأصناف المتتبَّعة في المكوّنات لعرض تحذير شامل.
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useComponentStock } from "@/features/inventory/hooks";

interface OrderFormProps {
  initialData?: OrderWithComponents | null;
  onSubmitSuccess: () => void;
  onCancel: () => void;
}

// Phase 1: قاعدة بيانات تُعيد catalogComponentId كـ string | null (Drizzle يستنتج
// null للأعمدة nullable). Zod تستعمل .optional() (= string | undefined). نُحوّل
// null → undefined لمطابقة نموذج الإدخال عند تعبئة defaultValues/reset. actions.ts
// يُحوّل undefined → null عند الكتابة للـ DB (?? null).
const toFormComponents = (comps: OrderWithComponents["components"] | undefined) =>
  (comps || []).map((c) => ({
    id: c.id,
    name: c.name,
    costCents: c.costCents,
    quantity: c.quantity,
    catalogComponentId: c.catalogComponentId ?? undefined,
  }));

// قيم النموذج المشتقّة من طلب قائم. مُستخدَمة في defaultValues وفي reset معاً
// حتى لا ينحرف التعريفان (كانا مكرّرين حرفياً قبل هذا).
// رقما الهاتف nullable في قاعدة البيانات وحقول الإدخال لا تقبل null — نُحوّلهما
// إلى "" هنا، والـ zod schema يُعيدهما إلى null عند الحفظ.
const toEditValues = (data: OrderWithComponents) => ({
  id: data.id,
  updatedAt: data.updatedAt ? new Date(data.updatedAt).toISOString() : "",
  customerName: data.customerName,
  customerPhone: data.customerPhone || "",
  customerPhoneAlt: data.customerPhoneAlt || "",
  productName: data.productName,
  quantity: data.quantity,
  components: toFormComponents(data.components),
  additionalCostsCents: data.additionalCostsCents ?? 0,
  totalPriceCents: data.totalPriceCents,
  notes: data.notes || "",
  deliveryDate: data.deliveryDate || "",
  receivedDate: data.receivedDate
    ? new Date(data.receivedDate).toLocaleDateString("en-CA")
    : new Date().toLocaleDateString("en-CA"),
  depositCents: data.depositCents ?? 0,
  depositDate: data.depositDate || "",
  deliveryPaidCents: data.deliveryPaidCents ?? 0,
  additionalProfitCents: data.additionalProfitCents ?? 0,
});

// نموذج واحد يخدم الإنشاء والتعديل: الإنشاء يحمل requestId، والتعديل يحمل
// id/updatedAt. نجعل الثلاثة اختيارية في نوع القيم حتى يقبل useForm الفرعين
// بلا cast — فتبقى reset() و setValue() مفحوصتين فعلياً.
type OrderFormValues = Omit<ReturnType<typeof toEditValues>, "id" | "updatedAt"> & {
  id?: string;
  updatedAt?: string;
  requestId?: string;
};

export function OrderForm({
  initialData,
  onSubmitSuccess,
  onCancel,
}: OrderFormProps) {
  const isEditMode = !!initialData;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStockShortage, setHasStockShortage] = useState(false);
  const [stockCheckReady, setStockCheckReady] = useState(false);
  const [stockWarningOpen, setStockWarningOpen] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<
    CreateOrderInput | UpdateOrderInput | null
  >(null);
  const [isDeliveryProfit, setIsDeliveryProfit] = useState(
    () => (initialData?.additionalProfitCents ?? 0) > 0,
  );
  const [requestId] = useState(() =>
    typeof window !== "undefined" ? window.crypto.randomUUID() : "",
  );

  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();

  const schema = isEditMode ? updateOrderSchema : createOrderSchema;

  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors, isDirty },
    // القيم الخام في الحقول (OrderFormValues) تختلف عن مخرجات zod بعد التحويل
    // (CreateOrderInput | UpdateOrderInput) — مثلاً "" في حقل الهاتف تصير null.
    // المعامل الثالث لـ useForm هو نوع القيم المحوَّلة التي يستقبلها onSubmit.
  } = useForm<OrderFormValues, unknown, CreateOrderInput | UpdateOrderInput>({
    // الـ schema يُختار وقت التشغيل بين إنشاء/تعديل، ولا يستطيع نظام الأنواع
    // التعبير عن ذلك — لذا يبقى الـ resolver بلا نوع كما كان.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
    mode: "onBlur",
    defaultValues: isEditMode
      ? toEditValues(initialData)
      : {
          requestId,
          customerName: "",
          customerPhone: "",
          customerPhoneAlt: "",
          productName: "",
          quantity: 1,
          components: [],
          additionalCostsCents: 0,
          totalPriceCents: 0,
          notes: "",
          deliveryDate: "",
          receivedDate: new Date().toLocaleDateString("en-CA"),
          depositCents: 0,
          depositDate: "",
          deliveryPaidCents: 0,
          additionalProfitCents: 0,
        },
  });

  // ── إعادة الضبط عند تبديل الطلب المُعدَّل — لا عند كل إعادة جلب ──────────
  //
  // 🔴 الخطأ الذي كان هنا: الـ effect كان يعتمد على `initialData` نفسه. البيانات
  // تأتي من `useOrder` (React Query) والـ QueryClient مضبوط على
  // `refetchOnWindowFocus: true` مع `staleTime: 30s`، وكل mutation في التطبيق
  // يُبطل `orderKeys.all` — أي أن الاستعلام يُعاد جلبه كثيراً، وكل إعادة جلب
  // تُنتج **كائناً جديداً** حتى لو لم يتغيّر أي حقل. فيُطلق الـ effect
  // ويستدعي reset() فيمحو ما كتبه المالك قبل أن يضغط «حفظ».
  //
  // على الهاتف كان هذا يحدث في كل مرة يخرج فيها من التطبيق ويعود (أو يفتح
  // الكيبورد ويغلقه) أثناء التعديل — تختفي التعديلات وترجع البيانات القديمة.
  //
  // الإصلاح: نُعيد الضبط فقط عند تغيّر **هوية** الطلب (id)، لا عند تغيّر
  // مرجع الكائن. القيم الأولية تُحمَّل أصلاً عبر defaultValues (الحاوية لا
  // تُركّب النموذج قبل وصول البيانات)، وOrdersClient يمرّر key={editId} فيُعاد
  // تركيب المكوّن عند تبديل الطلب — فهذا الحارس شبكة أمان مزدوجة.
  //
  // ملاحظة عن التزامن: عدم مزامنة `updatedAt` مع الخادم أثناء التعديل مقصود.
  // إن عدّل جهاز آخر نفس الطلب، يفشل الحفظ برسالة «عدّلته جهة أخرى» بدل أن
  // يدهس تعديل الآخر بصمت — وهو سلوك التزامن المتفائل المطلوب.
  const loadedOrderIdRef = useRef<string | null>(initialData?.id ?? null);
  useEffect(() => {
    if (!initialData) return;
    if (loadedOrderIdRef.current === initialData.id) return;
    loadedOrderIdRef.current = initialData.id;
    reset(toEditValues(initialData));
  }, [initialData, reset]);

  // ── مسودة localStorage (Issue #7) — إنشاء فقط، لا تُ persist في وضع التعديل ──
  const ORDER_DRAFT_KEY = "zman_draft_order";
  // القيمة المسحوبة من JSON؛ نُمرّرها إلى reset مع cast آمن (round-trip JSON).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draftOffer, setDraftOffer] = useState<any>(null);

  useEffect(() => {
    if (isEditMode) return;
    if (isDirty) {
      try {
        localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(getValues()));
      } catch {
        /* quota / private mode — silent */
      }
    } else {
      try {
        localStorage.removeItem(ORDER_DRAFT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [isDirty, isEditMode, getValues]);

  useEffect(() => {
    if (isEditMode) return;
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (raw) setDraftOffer(JSON.parse(raw));
    } catch {
      /* ignore corrupted entries */
    }
  }, []);

  const handleRestoreDraft = () => {
    if (draftOffer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reset(draftOffer as any);
    }
    setDraftOffer(null);
  };
  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(ORDER_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftOffer(null);
  };

  // مراقبة الحقول للحساب الحي (§9.2)
  const watchedComponents = watch("components") || [];
  const watchedQuantity = Number(watch("quantity")) || 0;
  const watchedAdditionalCosts = Number(watch("additionalCostsCents")) || 0;
  const watchedAdditionalProfit = Number(watch("additionalProfitCents")) || 0;
  const watchedTotalPrice = Number(watch("totalPriceCents")) || 0;
  const watchedDeposit = Number(watch("depositCents")) || 0;
  const watchedDeliveryPaid = Number(watch("deliveryPaidCents")) || 0;
  const remainingCents = Math.max(
    0,
    watchedTotalPrice + watchedAdditionalProfit - watchedDeposit,
  );

  // المعادلات الصحيحة:
  // تكلفة الوحدة الواحدة = Σ(تكلفة المكوّن × تكراره في الوحدة)
  const unitComponentsCostCents = watchedComponents.reduce(
    (sum: number, c: { costCents?: number; quantity?: number }) => {
      const cost = Number(c?.costCents) || 0;
      const repeat = Number(c?.quantity) || 0;
      return sum + cost * repeat;
    },
    0,
  );
  // تكلفة المكوّنات الكلية = تكلفة الوحدة × كمية المنتج
  const componentsCostCents = unitComponentsCostCents * watchedQuantity;
  // إجمالي التكلفة = تكلفة المكوّنات الكلية + التكاليف الإضافية (تُخصم، مرة واحدة)
  const totalCostCents = componentsCostCents + watchedAdditionalCosts;
  // صافي الربح = السعر − إجمالي التكلفة + الأرباح الإضافية (تُضاف، مرة واحدة).
  // التوصيل رقم مرجعي فقط ولا يدخل هذه المعادلة إطلاقاً.
  const netProfitCents =
    watchedTotalPrice - totalCostCents + watchedAdditionalProfit;
  const isProfit = netProfitCents >= 0;

  const submitOrder = async (data: CreateOrderInput | UpdateOrderInput) => {
    setIsSubmitting(true);
    try {
      // Issue #5 — تحقّق من الاتصال قبل أي طلب تعديل للخادم.
      try {
        assertOnline();
      } catch (e) {
        if (e instanceof Error && e.message === "offline") {
          toast.error("لا يوجد اتصال — لم يُحفظ. أعد المحاولة.");
          return;
        }
        throw e;
      }
      const submitData = isEditMode
        ? (data as UpdateOrderInput)
        : {
            ...(data as CreateOrderInput),
            requestId,
          };

      const response = isEditMode
        ? await updateOrderMutation.mutateAsync(submitData as UpdateOrderInput)
        : await createOrderMutation.mutateAsync(submitData as CreateOrderInput);

      if (response.status === "ok") {
        try { localStorage.removeItem("zman_draft_order"); } catch { /* ignore */ }
        toast.success(isEditMode ? "تم تحديث الطلب بنجاح" : "تم إنشاء الطلب بنجاح");
        onSubmitSuccess();
      } else {
        toast.error(response.message || "حدث خطأ أثناء الحفظ");
      }
    } catch (_error) {
      toast.error("فشل الاتصال بالسيرفر. يرجى التحقق من الشبكة");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: CreateOrderInput | UpdateOrderInput) => {
    if (hasStockShortage) {
      setPendingSubmitData(data);
      setStockWarningOpen(true);
      return;
    }
    await submitOrder(data);
  };

  const handleConfirmStockWarning = async () => {
    if (!pendingSubmitData) return;
    setStockWarningOpen(false);
    const data = pendingSubmitData;
    setPendingSubmitData(null);
    await submitOrder(data);
  };

  const handleCancelStockWarning = () => {
    setStockWarningOpen(false);
    setPendingSubmitData(null);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 max-w-xl mx-auto pb-32 lg:pb-0"
    >
      {/* مسودة غير محفوظة (Issue #7) */}
      {draftOffer && (
        <div className="p-3 rounded-lg border border-warn/30 bg-warn-soft text-warn-deep flex items-start gap-3 flex-wrap">
          <span className="text-sm flex-1">
            لديك مسودة غير محفوظة من إدخال سابق. هل تريد استرجاعها؟
          </span>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              variant="ink"
              className="min-h-[44px]"
              onClick={handleRestoreDraft}
            >
              استرجاع
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px]"
              onClick={handleDiscardDraft}
            >
              تجاهل
            </Button>
          </div>
        </div>
      )}

      {/* بيانات العميل */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <h3 className="text-base font-bold text-ink border-b border-hairline pb-2">
          بيانات العميل
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField
            id="customer-name"
            label="اسم العميل"
            autoCapitalize="words"
            autoComplete="name"
            error={errors.customerName?.message as string}
            {...register("customerName")}
          />

          <TextField
            id="customer-phone"
            label="رقم الهاتف (اختياري)"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            error={errors.customerPhone?.message as string}
            {...register("customerPhone")}
          />

          <TextField
            id="customer-phone-alt"
            label="الهاتف البديل (اختياري)"
            type="tel"
            inputMode="tel"
            error={errors.customerPhoneAlt?.message as string}
            {...register("customerPhoneAlt")}
          />
        </div>
      </div>

      {/* تفاصيل الطلب */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <h3 className="text-base font-bold text-ink border-b border-hairline pb-2">
          تفاصيل الطلب
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextField
            id="product-name"
            label="اسم المنتج"
            containerClassName="md:col-span-2"
            error={errors.productName?.message as string}
            {...register("productName")}
          />

          <TextField
            id="quantity"
            label="الكمية"
            inputMode="numeric"
            pattern="[0-9]*"
            error={errors.quantity?.message as string}
            {...register("quantity", { valueAsNumber: true })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-hairline pt-3 mt-2">
          <TextField
            id="delivery-date"
            label="تاريخ التسليم المتوقع"
            type="date"
            error={errors.deliveryDate?.message as string}
            {...register("deliveryDate")}
          />

          <TextField
            id="received-date"
            label="تاريخ استلام الطلب"
            type="date"
            error={errors.receivedDate?.message as string}
            {...register("receivedDate")}
          />
        </div>
      </div>

      {/* محرّر المكونات */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm">
        {/* Phase 3 (card 3.L) — شريط تحذير شامل للرصيد المتاح مقابل المطلوب. */}
        <TrackedStockBanner
          components={watchedComponents}
          orderQuantity={watchedQuantity}
          onShortageChange={setHasStockShortage}
          onStockCheckReady={setStockCheckReady}
        />
        <ComponentsEditor
          control={control}
          register={register}
          getValues={getValues}
          errors={errors}
        />
      </div>

      {/* التكاليف الإضافية على مستوى الطلب كاملاً */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-3">
        <div>
          <h3 className="text-base font-bold text-ink">تكاليف إضافية على الطلب</h3>
          <p className="text-xs text-ink-3 mt-0.5">
            تكاليف تُدفع على الطلب بالكامل وليست مكوّناً — كالتوصيل والتركيب والرسوم الأخرى
          </p>
        </div>
        <Controller
          control={control}
          name="additionalCostsCents"
          render={({ field: { value, onChange } }) => (
            <MoneyInput
              label=""
              value={value}
              onChange={onChange}
              placeholder="0.000"
              error={errors.additionalCostsCents?.message as string}
            />
          )}
        />
      </div>

      {/* مبلغ التوصيل والدفعات الإضافية */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-ink">مبلغ التوصيل والدفعات الإضافية</h3>
          <p className="text-xs text-ink-3 mt-0.5">
            سجل مبلغ التوصيل الفعلي الذي دفعه الزبون للطلب
          </p>
        </div>

        <Controller
          control={control}
          name="deliveryPaidCents"
          render={({ field: { value, onChange } }) => (
            <MoneyInput
              label="مبلغ التوصيل الذي دفعه العميل"
              value={value}
              onChange={(val) => {
                onChange(val);
                if (isDeliveryProfit) {
                  setValue("additionalProfitCents", val);
                }
              }}
              placeholder="0.000"
              error={errors.deliveryPaidCents?.message as string}
            />
          )}
        />

        <div className="flex items-center gap-2 pt-1 border-t border-hairline">
          <input
            type="checkbox"
            id="delivery-as-profit"
            checked={isDeliveryProfit}
            onChange={(e) => {
              const checked = e.target.checked;
              setIsDeliveryProfit(checked);
              if (checked) {
                const deliveryVal = getValues("deliveryPaidCents") || 0;
                setValue("additionalProfitCents", deliveryVal);
              } else {
                setValue("additionalProfitCents", 0);
              }
            }}
            className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand cursor-pointer"
          />
          <label htmlFor="delivery-as-profit" className="text-xs font-semibold text-ink cursor-pointer select-none">
            هل أدخله كإيراد وأرباح إضافية للمشروع عند التسليم؟ ✓
          </label>
        </div>
      </div>

      {/* التسعير */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <h3 className="text-base font-bold text-ink border-b border-hairline pb-2">
          التسعير والاتفاق
        </h3>

        <Controller
          control={control}
          name="totalPriceCents"
          render={({ field: { value, onChange } }) => (
            <MoneyInput
              label="السعر المتفق عليه مع العميل"
              value={value}
              onChange={onChange}
              placeholder="0.000"
              error={errors.totalPriceCents?.message as string}
            />
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="depositCents"
            render={({ field: { value, onChange } }) => (
              <div className="flex flex-col gap-1">
                <MoneyInput
                  label="العربون المدفوع (إن وجد)"
                  value={value}
                  onChange={onChange}
                  placeholder="0.000"
                  error={errors.depositCents?.message as string}
                />
                {watchedDeposit > 0 && (
                  <span className="text-xs text-brand font-medium">
                    المبلغ المتبقي للاستيفاء: <AmountText amount={remainingCents} />
                  </span>
                )}
              </div>
            )}
          />

          <TextField
            id="deposit-date"
            label="تاريخ استلام العربون"
            type="date"
            disabled={watchedDeposit === 0}
            containerClassName="disabled:opacity-50"
            className="disabled:bg-canvas"
            error={errors.depositDate?.message as string}
            {...register("depositDate")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-semibold text-ink-2">
            ملاحظات
          </label>
          <textarea
            id="notes"
            rows={3}
            placeholder=""
            {...register("notes")}
            className="w-full px-4 py-3 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
          />
          {errors.notes?.message && (
            <span className="text-xs text-alert">{errors.notes.message as string}</span>
          )}
        </div>
      </div>

      {/* ملخص الطلب المالي */}
      <div className="bg-paper rounded-lg border border-hairline shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-hairline bg-canvas">
          <h3 className="text-sm font-bold text-ink">ملخص الطلب</h3>
        </div>
        <div className="divide-y divide-hairline">
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-ink-2">تكلفة الوحدة الواحدة</span>
            <span className="text-sm font-semibold text-ink">
              <AmountText amount={unitComponentsCostCents} />
            </span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-ink-2">
              × الكمية ({watchedQuantity || 0})
            </span>
            <span className="text-sm font-semibold text-ink">
              <AmountText amount={componentsCostCents} />
            </span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-ink-2">تكاليف إضافية</span>
            <span className="text-sm font-semibold text-ink">
              <AmountText amount={watchedAdditionalCosts} />
            </span>
          </div>
          <div className="flex justify-between items-center px-5 py-3 bg-canvas">
            <span className="text-sm font-bold text-ink">إجمالي التكلفة</span>
            <span className="text-sm font-bold text-ink">
              <AmountText amount={totalCostCents} />
            </span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-ink-2">السعر المتفق عليه</span>
            <span className="text-sm font-semibold text-brand">
              <AmountText amount={watchedTotalPrice} />
            </span>
          </div>
          {watchedAdditionalProfit > 0 && (
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-ink-2">أرباح إضافية</span>
              <span className="text-sm font-semibold text-brand">
                +<AmountText amount={watchedAdditionalProfit} />
              </span>
            </div>
          )}
          {watchedDeposit > 0 && (
            <>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-ink-2">العربون المستلم</span>
                <span className="text-sm font-semibold text-brand">
                  <AmountText amount={watchedDeposit} />
                </span>
              </div>
              <div className="flex justify-between items-center px-5 py-3 bg-canvas">
                <span className="text-sm font-bold text-ink">المبلغ المتبقي للتسوية</span>
                <span className="text-sm font-bold text-ink">
                  <AmountText amount={remainingCents} />
                </span>
              </div>
            </>
          )}
          {/* صافي الربح / الخسارة */}
          <div
            className={`flex justify-between items-center px-5 py-4 ${
              isProfit ? "bg-brand-soft" : "bg-alert-soft"
            }`}
          >
            <div className="flex items-center gap-2">
              {isProfit ? (
                <TrendingUp className="w-4 h-4 text-brand" />
              ) : (
                <TrendingDown className="w-4 h-4 text-alert" />
              )}
              <span className={`text-sm font-bold ${isProfit ? "text-brand" : "text-alert"}`}>
                صافي الربح (مرجعي/مُقدّر)
              </span>
            </div>
            <span className={`text-base font-bold ${isProfit ? "text-brand" : "text-alert"}`}>
              {isProfit ? "+" : "−"}
              <AmountText amount={Math.abs(netProfitCents)} />
            </span>
          </div>

          {/* التوصيل — رقم مرجعي فقط، خارج حساب الربح */}
          {watchedDeliveryPaid > 0 && (
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-ink-3">التوصيل — مرجعي</span>
              <span className="text-sm font-medium text-ink-2">
                <AmountText amount={watchedDeliveryPaid} />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* أزرار الحفظ */}
      <div className="sticky bottom-0 bg-paper border-t border-hairline p-4 flex gap-3 lg:static lg:p-0 lg:bg-transparent lg:border-none z-sticky lg:z-auto">
        <Button
          variant="secondary"
          onClick={onCancel}
          isLoading={isSubmitting}
          className="flex-1"
        >
          إلغاء
        </Button>
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={isSubmitting || !stockCheckReady}
          className="flex-1"
        >
          {isEditMode ? "حفظ التعديلات" : "حفظ الطلب"}
        </Button>
      </div>

      <ResponsiveModal
        isOpen={stockWarningOpen}
        onClose={handleCancelStockWarning}
        title="تنبيه مهم قبل تسجيل الطلب"
      >
        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-sm text-warn-deep leading-relaxed">
            بعض المكوّنات المتتبَّعة المطلوبة لهذا الطلب تتجاوز الرصيد المتاح حالياً.
            سيُسمح بحفظ الطلب، وقد يظهر رصيد سالب عند التسليم إذا لم تُضف الكمية لاحقاً.
          </div>
          <p className="text-sm text-ink-2 leading-relaxed">
            يمكنك المتابعة وتسجيل الطلب كما هو، أو العودة لتعديل المكوّنات والكمية قبل الحفظ.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 min-h-[44px]"
              onClick={handleCancelStockWarning}
            >
              مراجعة المكوّنات
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1 min-h-[44px]"
              onClick={() => void handleConfirmStockWarning()}
              isLoading={isSubmitting}
            >
              متابعة وحفظ الطلب
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 3 (card 3.L) — شريط تحذير شامل للرصيد المتاح مقابل المطلوب.
//
// نأخذ لقطة المكوّنات المُراقَبة + كمية المنتج، نُحدِّد المكوّنات المرتبطة
// بأصناف كتالوج، نستعلم عن رصيد كل صنف، ونجمع:
//   - totalAvailable = Σ stock per unique tracked catalogComponentId
//   - totalRequired = Σ (component.quantity × orderQuantity) for tracked components
//
// إن totalRequired > totalAvailable: اعرض تحذيراً برتقالالياً. لا منع — مجرد
// توعية قبل التسليم (§6 سيناريو 1: لا منع للسالب).
//
// ملاحظة: totalAvailable يجمع الرصيد عبر الأصناف الفريدة فقط (لا يُضاعف إن تكرر
// نفس الصنف في مكوّنين). هذا عمداً — الرصيد ملك للصنف لا للمكوّن.
// ─────────────────────────────────────────────────────────────────────────

interface ComponentLike {
  catalogComponentId?: string | null;
  quantity?: number;
  name?: string;
  // D12 fix: حذفنا `unit?: string` — لم يكن يُستعمل في TrackedStockBanner ولا
  // يُخزَّن على order_component. الـ UI يصل للوحدة عبر catalog_component JOIN.
}

function TrackedStockBanner({
  components,
  orderQuantity,
  onShortageChange,
  onStockCheckReady,
}: {
  components: ComponentLike[];
  orderQuantity: number;
  onShortageChange: (hasShortage: boolean) => void;
  onStockCheckReady: (ready: boolean) => void;
}) {
  // اجلب أصناف الكتالوج لمعرفة أيها متتبَّع. (نعم، هذا fetch إضافي — نعذره لأن
  // البيانات صغيرة ومُخزَّنة مؤقتاً.)
  const { data: catalogItems = [], isLoading: isCatalogLoading } = useCatalogComponents();
  const trackedMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of catalogItems) m.set(c.id, c.tracked);
    return m;
  }, [catalogItems]);

  // اجمع معرّفات الأصناف المتتبَّعة المُستخدَمة في المكوّنات (فريدة).
  const trackedCatalogIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of components) {
      if (c.catalogComponentId && trackedMap.get(c.catalogComponentId)) {
        ids.add(c.catalogComponentId);
      }
    }
    return Array.from(ids);
  }, [components, trackedMap]);

  // اطلب رصيد كل صنف متتبَّع عبر مكوّن فرعي (React Query hook per id).
  // useComponentStock متاح في inventory/hooks. نُلوّن المكوّنات الفرعية لتُبلغ
  // الأب عبر callback. أبسط نهج: كل Child يُعيد رصيده، والأب يجمع.
  // نستخدم state محلياً للأب لتجميع الأرصدة عبر effect.
  const [stocks, setStocks] = useState<Record<string, number>>({});
  const [stockReady, setStockReady] = useState<Record<string, boolean>>({});

  // احسب المطلوب لكل صنف متتبَّع على حدة؛ لا يجوز أن يعوّض فائض صنف
  // نقص صنف آخر لأن الوحدات قد تكون مختلفة.
  const requiredById = useMemo(() => {
    const required = new Map<string, number>();
    for (const c of components) {
      if (!c.catalogComponentId || !trackedMap.get(c.catalogComponentId)) continue;
      const quantity = Number(c.quantity) || 0;
      required.set(
        c.catalogComponentId,
        (required.get(c.catalogComponentId) ?? 0) + quantity * (orderQuantity || 0),
      );
    }
    return required;
  }, [components, orderQuantity, trackedMap]);

  const totalRequired = trackedCatalogIds.reduce(
    (sum, id) => sum + (requiredById.get(id) ?? 0),
    0,
  );
  const totalAvailable = trackedCatalogIds.reduce(
    (sum, id) => sum + (stocks[id] ?? 0),
    0,
  );
  const stockDataReady = trackedCatalogIds.every((id) => stockReady[id]);
  const shortages = stockDataReady
    ? trackedCatalogIds
        .map((id) => ({
          id,
          required: requiredById.get(id) ?? 0,
          available: stocks[id] ?? 0,
        }))
        .filter((item) => item.required > item.available)
    : [];
  const isShort = shortages.length > 0;

  const stockCheckReady = !isCatalogLoading && stockDataReady;

  useEffect(() => {
    onShortageChange(stockCheckReady && isShort);
    onStockCheckReady(stockCheckReady);
  }, [isShort, onShortageChange, onStockCheckReady, stockCheckReady]);

  // إن لم تكن هناك أصناف متتبَّعة، لا تعرض شيئاً ولا تمنع حفظ الطلب.
  if (trackedCatalogIds.length === 0) return null;

  return (
    <div className="mb-4">
      {/* أبناء مخفيون لجلب الرصيد لكل صنف وتحديث state الأب. */}
      <div className="hidden">
        {trackedCatalogIds.map((id) => (
          <StockFetcher
            key={id}
            catalogComponentId={id}
            onStock={(s, ready) => {
              if (stocks[id] !== s) {
                setStocks((prev) => ({ ...prev, [id]: s }));
              }
              if (stockReady[id] !== ready) {
                setStockReady((prev) => ({ ...prev, [id]: ready }));
              }
            }}
          />
        ))}
      </div>

      <div
        className={`p-3 rounded-md border text-xs flex items-start gap-2 ${
          isShort
            ? "border-warn/40 bg-warn-soft text-warn-deep"
            : "border-brand/30 bg-brand-soft text-brand"
        }`}
      >
        <AlertTriangle
          className={`w-4 h-4 shrink-0 mt-0.5 ${isShort ? "text-warn-deep" : "text-brand"}`}
        />
        <div className="leading-relaxed">
          <span className="font-bold">
            الرصيد الإجمالي للمكوّنات المتتبَّعة: {totalAvailable}
          </span>
          <span className="opacity-70"> · </span>
          <span className="font-bold">
            المطلوب: {totalRequired}
          </span>
          {!stockDataReady ? (
            <span className="block mt-1">جارٍ التحقق من أرصدة المكوّنات…</span>
          ) : isShort ? (
            <>
              <span className="block mt-1 font-bold">
                يوجد نقص في صنف أو أكثر. يمكنك المتابعة، وسيُسمح برصيد سالب عند التسليم.
              </span>
              <ul className="mt-2 space-y-1">
                {shortages.map((shortage) => {
                  const item = catalogItems.find((catalogItem) => catalogItem.id === shortage.id);
                  return (
                    <li key={shortage.id}>
                      {item?.name ?? "مكوّن متتبَّع"}: المطلوب {shortage.required}، المتاح {shortage.available}، النقص {shortage.required - shortage.available}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <span className="block mt-1">الأرصدة المتتبَّعة تكفي الكمية الحالية.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * مكوّن فرعي مخفي يطلب رصيد صنف واحد ويُبلغ الأب عبر callback. ضروري لأن
 * React لا يسمح باستدعاء hooks داخل حلقة — يجب أن يكون لكل استدعاء hook
 * مكوّن مستقل.
 */
function StockFetcher({
  catalogComponentId,
  onStock,
}: {
  catalogComponentId: string;
  onStock: (stock: number, ready: boolean) => void;
}) {
  const { data: stock = 0, isLoading } = useComponentStock(catalogComponentId);

  useEffect(() => {
    onStock(stock, !isLoading);
  }, [stock, isLoading, onStock]);

  return null;
}
