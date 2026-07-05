"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { List, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { purchaseInputSchema } from "../schema";
import type { NewPurchase, Purchase } from "../types";
import { usePurchaseItemCatalog } from "../hooks";

interface PurchaseFormProps {
  initialData?: Purchase | null;
  onSubmit: (values: NewPurchase) => void;
  onDelete?: () => void;
  isSubmitting: boolean;
}

export function PurchaseForm({
  initialData,
  onSubmit,
  onDelete,
  isSubmitting,
}: PurchaseFormProps) {
  const formId = useId();
  const [isCustomItem, setIsCustomItem] = useState(!initialData?.item);

  // جلب العناصر الشائعة للمشتريات
  const { data: catalogItems = [] } = usePurchaseItemCatalog();

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toLocaleDateString("en-CA") ?? "")
      : new Date().toLocaleDateString("en-CA"),
    item: initialData?.item || "",
    supplier: initialData?.supplier || "",
    quantity: initialData?.quantity || 1,
    unitCostCents: initialData?.unitCostCents || 0,
    totalCents: initialData?.totalCents || 0,
    notes: initialData?.notes || "",
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(purchaseInputSchema),
    defaultValues,
  });

  const watchQty = watch("quantity") || 0;
  const watchUnitCost = watch("unitCostCents") || 0;
  const watchTotal = watch("totalCents") || 0;

  // مزامنة ثنائية الاتجاه بين سعر الوحدة والإجمالي:
  // - تعديل سعر الوحدة  → إجمالي = كمية × سعر الوحدة
  // - تعديل الإجمالي     → سعر الوحدة = إجمالي ÷ كمية
  // - تعديل الكمية       → نعيد حساب الإجمالي من سعر الوحدة (المصدر الأساسي)
  // نتتبّع آخر حقل عدّله المستخدم لتحديد اتجاه الحساب.
  const lastEdited = useRef<"unit" | "total">("unit");

  const handleUnitCostChange = (value: number) => {
    lastEdited.current = "unit";
    setValue("unitCostCents", value);
    const qty = watch("quantity") || 0;
    setValue("totalCents", Math.round(value * qty));
  };

  const handleTotalChange = (value: number) => {
    lastEdited.current = "total";
    setValue("totalCents", value);
    const qty = watch("quantity") || 0;
    setValue("unitCostCents", qty > 0 ? Math.round(value / qty) : 0);
  };

  // عند تغيّر الكمية: نعيد الحساب حسب آخر حقل عدّله المستخدم
  useEffect(() => {
    if (lastEdited.current === "total") {
      setValue(
        "unitCostCents",
        watchQty > 0 ? Math.round(watchTotal / watchQty) : 0,
      );
    } else {
      setValue("totalCents", Math.round(watchQty * watchUnitCost));
    }
    // نراقب الكمية فقط عمداً (إعادة الحساب عند تغيّرها)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchQty]);

  useEffect(() => {
    if (initialData) {
      setValue(
        "date",
        new Date(initialData.date).toLocaleDateString("en-CA") ?? "",
      );
      setValue("item", initialData.item);
      setValue("supplier", initialData.supplier || "");
      setValue("quantity", initialData.quantity);
      setValue("unitCostCents", initialData.unitCostCents);
      setValue("totalCents", initialData.totalCents);
      setValue("notes", initialData.notes || "");
      setIsCustomItem(!catalogItems.some((c) => c.name === initialData.item));
    }
  }, [initialData, setValue, catalogItems]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        {/* التاريخ */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-date`}
            className="text-sm font-bold text-ink/75"
          >
            تاريخ الشراء
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            {...register("date")}
            className={`flex h-12 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
              errors.date ? "border-alert" : ""
            }`}
          />
          {errors.date && (
            <p className="text-xs text-alert mt-1">
              {errors.date.message as string}
            </p>
          )}
        </div>

        {/* بيان المشتريات */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-item`}
            className="text-sm font-bold text-ink/75"
          >
            بيان المواد / الأصناف
          </label>
          {!isCustomItem && catalogItems.length > 0 ? (
            <Select
              id={`${formId}-item-select`}
              value={watch("item")}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setIsCustomItem(true);
                  setValue("item", "");
                } else {
                  setValue("item", val);
                }
              }}
              error={errors.item?.message as string}
            >
              <option value="">-- اختر الصنف --</option>
              {catalogItems.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="custom">أخرى (إدخال يدوي) ...</option>
            </Select>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                id={`${formId}-item`}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                placeholder="أدخل اسم الصنف..."
                {...register("item")}
                className={`min-w-0 flex-1 h-12 px-4 py-2 rounded-md border border-hairline-2 bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10 ${
                  errors.item ? "border-alert" : ""
                }`}
              />
              {catalogItems.length > 0 && (
                <Button
                  onClick={() => {
                    setIsCustomItem(false);
                    setValue("item", catalogItems[0]?.name || "");
                  }}
                  variant="secondary"
                  size="icon"
                  aria-label="اختيار من الأصناف المخزّنة"
                  title="اختيار من الأصناف المخزّنة"
                  className="h-12 w-12 shrink-0"
                >
                  <List className="w-5 h-5" />
                </Button>
              )}
            </div>
          )}
          {isCustomItem && errors.item && (
            <p className="text-xs text-alert mt-1">
              {errors.item.message as string}
            </p>
          )}
        </div>

        {/* المورد */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-supplier`}
            className="text-sm font-bold text-ink/75"
          >
            اسم المورد (اختياري)
          </label>
          <input
            id={`${formId}-supplier`}
            type="text"
            placeholder="مثال: مشتل الأردن"
            {...register("supplier")}
            className={`flex h-12 w-full rounded-md border border-hairline-2 bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10 ${
              errors.supplier ? "border-alert" : ""
            }`}
          />
          {errors.supplier && (
            <p className="text-xs text-alert mt-1">
              {errors.supplier.message as string}
            </p>
          )}
        </div>

        {/* الكمية وسعر الوحدة */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 flex flex-col">
            <label
              htmlFor={`${formId}-qty`}
              className="text-sm font-bold text-ink/75"
            >
              الكمية
            </label>
            <input
              id={`${formId}-qty`}
              type="number"
              inputMode="numeric"
              step="any"
              {...register("quantity", { valueAsNumber: true })}
              className={`flex h-12 w-full rounded-md border border-hairline-2 bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink/10 ${
                errors.quantity ? "border-alert" : ""
              }`}
            />
            {errors.quantity && (
              <p className="text-xs text-alert mt-1">
                {errors.quantity.message as string}
              </p>
            )}
          </div>

          <div className="space-y-2 flex flex-col">
            <label
              htmlFor={`${formId}-unitCost`}
              className="text-sm font-bold text-ink/75"
            >
              سعر الوحدة
            </label>
            <Controller
              name="unitCostCents"
              control={control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={handleUnitCostChange}
                  error={errors.unitCostCents?.message as string}
                />
              )}
            />
            {errors.unitCostCents && (
              <p className="text-xs text-alert mt-1">
                {errors.unitCostCents.message as string}
              </p>
            )}
          </div>
        </div>

        {/* الإجمالي — قابل للإدخال (يحدّث سعر الوحدة تلقائياً) */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-total`}
            className="text-sm font-bold text-ink/75"
          >
            إجمالي التكلفة
          </label>
          <Controller
            name="totalCents"
            control={control}
            render={({ field }) => (
              <MoneyInput
                value={Number(field.value) || 0}
                onChange={handleTotalChange}
                error={errors.totalCents?.message as string}
              />
            )}
          />
        </div>

        {/* سعر القطعة الواحدة — محسوب للعرض فقط */}
        <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline flex items-center justify-between">
          <span className="text-sm font-bold text-ink-2">سعر القطعة الواحدة:</span>
          <span className="text-lg font-extrabold text-info">
            {watchQty > 0 ? (
              <AmountText amount={Math.round(watchTotal / watchQty)} />
            ) : (
              <span className="text-ink-3">—</span>
            )}
          </span>
        </div>

        {/* ملاحظات */}
        <TextArea
          label="ملاحظات إضافية"
          id={`${formId}-notes`}
          placeholder=""
          {...register("notes")}
          error={errors.notes?.message as string}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="ink"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة المشتريات"}
        </Button>

        {initialData && onDelete && (
          <Button
            variant="icon"
            onClick={onDelete}
            disabled={isSubmitting}
            className="text-alert border-alert hover:bg-alert/5"
            title="حذف المشتريات"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>
    </form>
  );
}
