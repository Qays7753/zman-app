"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
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

export function OrderForm({
  initialData,
  onSubmitSuccess,
  onCancel,
}: OrderFormProps) {
  const isEditMode = !!initialData;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeliveryProfit, setIsDeliveryProfit] = useState(
    () => (initialData?.additionalProfitCents ?? 0) > 0,
  );
  const [requestId] = useState(() =>
    typeof window !== "undefined" ? window.crypto.randomUUID() : "",
  );

  const createOrderMutation = useCreateOrder();
  const updateOrderMutation = useUpdateOrder();

  const schema = isEditMode ? updateOrderSchema : createOrderSchema;

  // Phase 1: قاعدة بيانات تُعيد catalogComponentId كـ string | null (Drizzle يستنتج
  // null للأعمدة nullable). Zod تستعمل .optional() (= string | undefined). نُحوّل
  // null → undefined لمطابقة نموذج الإدخال عند تعبئة defaultValues/reset. actions.ts
  // يُحوّل undefined → null عند الكتابة للـ DB (?? null).
  const toFormComponents = (
    comps: OrderWithComponents["components"] | undefined,
  ) =>
    (comps || []).map((c) => ({
      id: c.id,
      name: c.name,
      costCents: c.costCents,
      quantity: c.quantity,
      catalogComponentId: c.catalogComponentId ?? undefined,
    }));

  const {
    register,
    handleSubmit,
    control,
    watch,
    getValues,
    setValue,
    reset,
    formState: { errors },
  } = useForm({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    mode: "onBlur",
    defaultValues: isEditMode
      ? {
          id: initialData.id,
          updatedAt: initialData.updatedAt
            ? new Date(initialData.updatedAt).toISOString()
            : "",
          customerName: initialData.customerName,
          customerPhone: initialData.customerPhone,
          customerPhoneAlt: initialData.customerPhoneAlt || "",
          productName: initialData.productName,
          quantity: initialData.quantity,
          components: toFormComponents(initialData.components),
          additionalCostsCents: initialData.additionalCostsCents ?? 0,
          totalPriceCents: initialData.totalPriceCents,
          notes: initialData.notes || "",
          deliveryDate: initialData.deliveryDate || "",
          receivedDate: initialData.receivedDate
            ? new Date(initialData.receivedDate).toLocaleDateString("en-CA")
            : new Date().toLocaleDateString("en-CA"),
          depositCents: initialData.depositCents ?? 0,
          depositDate: initialData.depositDate || "",
          deliveryPaidCents: initialData.deliveryPaidCents ?? 0,
          additionalProfitCents: initialData.additionalProfitCents ?? 0,
        }
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

  // إعادة ضبط قيم النموذج عند تحميل أو تغيير بيانات التعديل
  useEffect(() => {
    if (initialData) {
      reset({
        id: initialData.id,
        updatedAt: initialData.updatedAt
          ? new Date(initialData.updatedAt).toISOString()
          : "",
        customerName: initialData.customerName,
        customerPhone: initialData.customerPhone,
        customerPhoneAlt: initialData.customerPhoneAlt || "",
        productName: initialData.productName,
        quantity: initialData.quantity,
        components: toFormComponents(initialData.components),
        additionalCostsCents: initialData.additionalCostsCents ?? 0,
        totalPriceCents: initialData.totalPriceCents,
        notes: initialData.notes || "",
        deliveryDate: initialData.deliveryDate || "",
        receivedDate: initialData.receivedDate
          ? new Date(initialData.receivedDate).toLocaleDateString("en-CA")
          : new Date().toLocaleDateString("en-CA"),
        depositCents: initialData.depositCents ?? 0,
        depositDate: initialData.depositDate || "",
        deliveryPaidCents: initialData.deliveryPaidCents ?? 0,
        additionalProfitCents: initialData.additionalProfitCents ?? 0,
      });
    }
  }, [initialData, reset]);

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

  const onSubmit = async (data: CreateOrderInput | UpdateOrderInput) => {
    setIsSubmitting(true);
    try {
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 max-w-xl mx-auto pb-32 lg:pb-0"
    >
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
            label="رقم الهاتف"
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
            className="h-4 w-4 rounded border-hairline text-info focus:ring-info cursor-pointer"
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
                  <span className="text-xs text-info font-medium">
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
            <span className="text-sm font-semibold text-info">
              <AmountText amount={watchedTotalPrice} />
            </span>
          </div>
          {watchedAdditionalProfit > 0 && (
            <div className="flex justify-between items-center px-5 py-3">
              <span className="text-sm text-ink-2">أرباح إضافية</span>
              <span className="text-sm font-semibold text-info">
                +<AmountText amount={watchedAdditionalProfit} />
              </span>
            </div>
          )}
          {watchedDeposit > 0 && (
            <>
              <div className="flex justify-between items-center px-5 py-3">
                <span className="text-sm text-ink-2">العربون المستلم</span>
                <span className="text-sm font-semibold text-info">
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
              isProfit ? "bg-info-soft" : "bg-alert-soft"
            }`}
          >
            <div className="flex items-center gap-2">
              {isProfit ? (
                <TrendingUp className="w-4 h-4 text-info" />
              ) : (
                <TrendingDown className="w-4 h-4 text-alert" />
              )}
              <span className={`text-sm font-bold ${isProfit ? "text-info" : "text-alert"}`}>
                صافي الربح (مرجعي/مُقدّر)
              </span>
            </div>
            <span className={`text-base font-bold ${isProfit ? "text-info" : "text-alert"}`}>
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
          className="flex-1"
        >
          {isEditMode ? "حفظ التعديلات" : "حفظ الطلب"}
        </Button>
      </div>
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
}: {
  components: ComponentLike[];
  orderQuantity: number;
}) {
  // اجلب أصناف الكتالوج لمعرفة أيها متتبَّع. (نعم، هذا fetch إضافي — نعذره لأن
  // البيانات صغيرة ومُخزَّنة مؤقتاً.)
  const { data: catalogItems = [] } = useCatalogComponents();
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

  // إن لم تكن هناك أصناف متتبَّعة، لا تعرض شيئاً.
  if (trackedCatalogIds.length === 0) return null;

  // احسب المطلوب: Σ (component.quantity × orderQuantity) لكل مكوّن متتبَّع.
  const totalRequired = components.reduce((sum, c) => {
    if (c.catalogComponentId && trackedMap.get(c.catalogComponentId)) {
      const q = Number(c.quantity) || 0;
      return sum + q * (orderQuantity || 0);
    }
    return sum;
  }, 0);

  const totalAvailable = trackedCatalogIds.reduce(
    (sum, id) => sum + (stocks[id] ?? 0),
    0,
  );

  const isShort = totalRequired > totalAvailable;

  return (
    <div className="mb-4">
      {/* أبناء مخفيون لجلب الرصيد لكل صنف وتحديث state الأب. */}
      <div className="hidden">
        {trackedCatalogIds.map((id) => (
          <StockFetcher
            key={id}
            catalogComponentId={id}
            onStock={(s) => {
              if (stocks[id] !== s) {
                setStocks((prev) => ({ ...prev, [id]: s }));
              }
            }}
          />
        ))}
      </div>

      <div
        className={`p-3 rounded-md border text-xs flex items-start gap-2 ${
          isShort
            ? "border-warn/40 bg-warn-soft text-warn-deep"
            : "border-info/30 bg-info-soft text-info"
        }`}
      >
        <AlertTriangle
          className={`w-4 h-4 shrink-0 mt-0.5 ${isShort ? "text-warn-deep" : "text-info"}`}
        />
        <div className="leading-relaxed">
          <span className="font-bold">
            الرصيد الإجمالي للمكوّنات المتتبَّعة: {totalAvailable}
          </span>
          <span className="opacity-70"> · </span>
          <span className="font-bold">
            المطلوب: {totalRequired}
          </span>
          {isShort && (
            <span className="block mt-1">
              ⚠️ المطلوب يتجاوز المتاح بـ {totalRequired - totalAvailable}. يمكنك
              المتابعة لكن سيُخصم رصيد سالب (مسموح). يُنصح بشراء كمية إضافية أو
              تعديل المكوّنات.
            </span>
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
  onStock: (stock: number) => void;
}) {
  const { data: stock = 0 } = useComponentStock(catalogComponentId);

  useEffect(() => {
    onStock(stock);
  }, [stock, onStock]);

  return null;
}
