"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
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
  const { data: catalogItems = [] } = usePurchaseItemCatalog();
  const [isCustomItem, setIsCustomItem] = useState(false);

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toISOString().split("T")[0] ?? "")
      : new Date().toLocaleDateString("en-CA"),
    item: initialData?.item || "",
    supplier: initialData?.supplier || "",
    quantity: initialData?.quantity || 1,
    unitCostCents: initialData?.unitCostCents || 0,
    notes: initialData?.notes || "",
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(purchaseInputSchema),
    defaultValues,
  });

  const quantity = watch("quantity");
  const unitCostCents = watch("unitCostCents");
  const calculatedTotal =
    (Number(quantity) || 0) * (Number(unitCostCents) || 0);

  useEffect(() => {
    if (initialData) {
      setValue(
        "date",
        new Date(initialData.date).toISOString().split("T")[0] ?? "",
      );
      setValue("item", initialData.item);
      setValue("supplier", initialData.supplier);
      setValue("quantity", initialData.quantity);
      setValue("unitCostCents", initialData.unitCostCents);
      setValue("notes", initialData.notes);

      const inCatalog = catalogItems.some((c) => c.name === initialData.item);
      if (!inCatalog && catalogItems.length > 0) {
        setIsCustomItem(true);
      }
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
            تاريخ العملية
          </label>
          <input
            id={`${formId}-date`}
            type="date"
            {...register("date")}
            className={`flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
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
            <select
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
              className={`flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                errors.item ? "border-alert" : ""
              }`}
            >
              <option value="">-- اختر الصنف --</option>
              {catalogItems.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="custom">أخرى (إدخال يدوي) ...</option>
            </select>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                id={`${formId}-item`}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                placeholder="أدخل اسم الصنف..."
                {...register("item")}
                className={`flex-1 h-11 px-3 py-2 rounded-md border border-hairline bg-paper text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  errors.item ? "border-alert" : ""
                }`}
              />
              {catalogItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomItem(false);
                    setValue("item", catalogItems[0]?.name || "");
                  }}
                  className="h-11 px-3 border border-hairline hover:bg-canvas rounded-md text-xs text-ink-2 shrink-0"
                >
                  اختر من القائمة
                </button>
              )}
            </div>
          )}
          {errors.item && (
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
            inputMode="text"
            placeholder=""
            {...register("supplier")}
            className={`flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
              errors.supplier ? "border-alert" : ""
            }`}
          />
          {errors.supplier && (
            <p className="text-xs text-alert mt-1">
              {errors.supplier.message as string}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* الكمية */}
          <div className="space-y-2 flex flex-col">
            <label
              htmlFor={`${formId}-quantity`}
              className="text-sm font-bold text-ink/75"
            >
              الكمية
            </label>
            <input
              id={`${formId}-quantity`}
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              {...register("quantity")}
              className={`flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                errors.quantity ? "border-alert" : ""
              }`}
            />
            {errors.quantity && (
              <p className="text-xs text-alert mt-1">
                {errors.quantity.message as string}
              </p>
            )}
          </div>

          {/* سعر الوحدة */}
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
                  onChange={field.onChange}
                  disabled={isSubmitting}
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

        {/* المجموع المحتسب */}
        <div className="p-4 bg-canvas/40 rounded-lg flex items-center justify-between border border-hairline">
          <span className="text-sm font-medium text-ink/60">
            المجموع الكلي التقديري (محتسب):
          </span>
          <span className="text-lg font-bold text-ink">
            <AmountText amount={calculatedTotal} />
          </span>
        </div>

        {/* ملاحظات */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-notes`}
            className="text-sm font-bold text-ink/75"
          >
            ملاحظات إضافية
          </label>
          <textarea
            id={`${formId}-notes`}
            placeholder=""
            {...register("notes")}
            className={`flex min-h-[80px] w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
              errors.notes ? "border-alert" : ""
            }`}
          />
          {errors.notes && (
            <p className="text-xs text-alert mt-1">
              {errors.notes.message as string}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 h-12 bg-ink text-paper rounded-md flex items-center justify-center gap-1.5 text-md font-bold shadow-sm hover:bg-ink/90 disabled:opacity-50 transition-colors"
        >
          {isSubmitting
            ? "جاري الحفظ..."
            : initialData
              ? "حفظ التعديلات"
              : "إضافة المشتريات"}
        </button>

        {initialData && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSubmitting}
            className="h-12 w-12 border border-alert text-alert rounded-md flex items-center justify-center hover:bg-alert/5 disabled:opacity-50 transition-colors"
            title="حذف المشتريات"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </form>
  );
}
