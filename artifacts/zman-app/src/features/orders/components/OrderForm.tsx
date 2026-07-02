"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
import type { CreateOrderInput, UpdateOrderInput } from "../schema";
import { createOrderSchema, updateOrderSchema } from "../schema";
import type { OrderWithComponents } from "../types";
import { ComponentsEditor } from "./ComponentsEditor";
import { useCreateOrder, useUpdateOrder } from "../hooks";

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
          components: initialData.components || [],
          additionalCostsCents: initialData.additionalCostsCents ?? 0,
          totalPriceCents: initialData.totalPriceCents,
          notes: initialData.notes || "",
          deliveryDate: initialData.deliveryDate || "",
          receivedDate: initialData.receivedDate
            ? new Date(initialData.receivedDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
          depositCents: initialData.depositCents ?? 0,
          depositDate: initialData.depositDate || "",
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
          receivedDate: new Date().toISOString().split("T")[0],
          depositCents: 0,
          depositDate: "",
        },
  });

  // مراقبة الحقول للحساب الحي (§9.2)
  const watchedComponents = watch("components") || [];
  const watchedAdditionalCosts = Number(watch("additionalCostsCents")) || 0;
  const watchedTotalPrice = Number(watch("totalPriceCents")) || 0;
  const watchedDeposit = Number(watch("depositCents")) || 0;
  const remainingCents = Math.max(0, watchedTotalPrice - watchedDeposit);

  // المعادلات الصحيحة:
  // تكلفة المكونات = مجموع (تكلفة كل مكون × كميته)
  const componentsCostCents = watchedComponents.reduce(
    (sum: number, c: { costCents?: number; quantity?: number }) => {
      const cost = Number(c?.costCents) || 0;
      const qty = Number(c?.quantity) || 0;
      return sum + cost * qty;
    },
    0,
  );
  // إجمالي التكلفة = تكلفة المكونات + التكاليف الإضافية
  const totalCostCents = componentsCostCents + watchedAdditionalCosts;
  // صافي الربح = السعر المتفق عليه − إجمالي التكلفة
  const netProfitCents = watchedTotalPrice - totalCostCents;
  const isProfit = netProfitCents >= 0;

  const onSubmit = async (data: CreateOrderInput | UpdateOrderInput) => {
    setIsSubmitting(true);
    try {
      const response = isEditMode
        ? await updateOrderMutation.mutateAsync(data as UpdateOrderInput)
        : await createOrderMutation.mutateAsync(data as CreateOrderInput);

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
      className="space-y-5 max-w-xl mx-auto pb-24 lg:pb-0"
    >
      {/* بيانات العميل */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <h3 className="text-base font-bold text-ink border-b border-hairline pb-2">
          بيانات العميل
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="customer-name" className="text-sm font-semibold text-ink-2">
              اسم العميل
            </label>
            <input
              id="customer-name"
              type="text"
              inputMode="text"
              autoCapitalize="words"
              autoComplete="name"
              placeholder=""
              {...register("customerName")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.customerName?.message && (
              <span className="text-xs text-alert">{errors.customerName.message as string}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="customer-phone" className="text-sm font-semibold text-ink-2">
              رقم الهاتف
            </label>
            <input
              id="customer-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder=""
              {...register("customerPhone")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.customerPhone?.message && (
              <span className="text-xs text-alert">{errors.customerPhone.message as string}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="customer-phone-alt" className="text-sm font-semibold text-ink-2">
              الهاتف البديل (اختياري)
            </label>
            <input
              id="customer-phone-alt"
              type="tel"
              inputMode="tel"
              placeholder=""
              {...register("customerPhoneAlt")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.customerPhoneAlt?.message && (
              <span className="text-xs text-alert">{errors.customerPhoneAlt.message as string}</span>
            )}
          </div>
        </div>
      </div>

      {/* تفاصيل الطلب */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
        <h3 className="text-base font-bold text-ink border-b border-hairline pb-2">
          تفاصيل الطلب
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 flex flex-col gap-1">
            <label htmlFor="product-name" className="text-sm font-semibold text-ink-2">
              اسم المنتج
            </label>
            <input
              id="product-name"
              type="text"
              inputMode="text"
              placeholder=""
              {...register("productName")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.productName?.message && (
              <span className="text-xs text-alert">{errors.productName.message as string}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="quantity" className="text-sm font-semibold text-ink-2">
              الكمية
            </label>
            <input
              id="quantity"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder=""
              {...register("quantity", { valueAsNumber: true })}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.quantity?.message && (
              <span className="text-xs text-alert">{errors.quantity.message as string}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-hairline pt-3 mt-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="delivery-date" className="text-sm font-semibold text-ink-2">
              تاريخ التسليم المتوقع
            </label>
            <input
              id="delivery-date"
              type="date"
              {...register("deliveryDate")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.deliveryDate?.message && (
              <span className="text-xs text-alert">{errors.deliveryDate.message as string}</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="received-date" className="text-sm font-semibold text-ink-2">
              تاريخ استلام الطلب
            </label>
            <input
              id="received-date"
              type="date"
              {...register("receivedDate")}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors"
            />
            {errors.receivedDate?.message && (
              <span className="text-xs text-alert">{errors.receivedDate.message as string}</span>
            )}
          </div>
        </div>
      </div>

      {/* محرّر المكونات */}
      <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm">
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

          <div className="flex flex-col gap-1">
            <label htmlFor="deposit-date" className="text-sm font-semibold text-ink-2">
              تاريخ استلام العربون
            </label>
            <input
              id="deposit-date"
              type="date"
              {...register("depositDate")}
              disabled={watchedDeposit === 0}
              className="w-full h-11 px-4 rounded-md border border-hairline-2 focus:outline-none focus:ring-2 focus:ring-ink bg-paper text-base transition-colors disabled:opacity-50 disabled:bg-canvas"
            />
            {errors.depositDate?.message && (
              <span className="text-xs text-alert">{errors.depositDate.message as string}</span>
            )}
          </div>
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
            <span className="text-sm text-ink-2">تكلفة المكوّنات</span>
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
                صافي الربح
              </span>
            </div>
            <span className={`text-base font-bold ${isProfit ? "text-info" : "text-alert"}`}>
              {isProfit ? "+" : "−"}
              <AmountText amount={Math.abs(netProfitCents)} />
            </span>
          </div>
        </div>
      </div>

      {/* أزرار الحفظ */}
      <div className="fixed bottom-0 inset-x-0 p-4 bg-paper/95 backdrop-blur-md border-t border-hairline flex gap-3 lg:static lg:p-0 lg:bg-transparent lg:border-none z-dropdown lg:z-auto">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 min-h-[44px] py-3 px-4 rounded-md border border-hairline-2 text-ink-2 hover:bg-canvas font-semibold transition-colors disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 min-h-[44px] py-3 px-4 rounded-md bg-info text-paper font-bold hover:bg-info/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>جاري الحفظ...</span>
            </>
          ) : (
            <span>{isEditMode ? "حفظ التعديلات" : "حفظ الطلب"}</span>
          )}
        </button>
      </div>
    </form>
  );
}
