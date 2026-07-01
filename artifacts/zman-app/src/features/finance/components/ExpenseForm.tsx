"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { expenseInputSchema } from "../schema";
import type { Expense, NewExpense } from "../types";
import { useExpenseCategoryCatalog } from "../hooks";

interface ExpenseFormProps {
  initialData?: Expense | null;
  onSubmit: (values: NewExpense) => void;
  onDelete?: () => void;
  isSubmitting: boolean;
  categories: string[];
}

export function ExpenseForm({
  initialData,
  onSubmit,
  onDelete,
  isSubmitting,
  categories,
}: ExpenseFormProps) {
  const formId = useId();
  const { data: dbCategories = [] } = useExpenseCategoryCatalog();
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const finalCategories = dbCategories.length > 0
    ? dbCategories.map((c) => c.name)
    : categories;

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toISOString().split("T")[0] ?? "")
      : new Date().toLocaleDateString("en-CA"),
    category: initialData?.category || categories[0] || "رواتب",
    amountCents: initialData?.amountCents || 0,
    description: initialData?.description || "",
  };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(expenseInputSchema),
    defaultValues,
  });

  useEffect(() => {
    if (initialData) {
      setValue(
        "date",
        new Date(initialData.date).toISOString().split("T")[0] ?? "",
      );
      setValue("category", initialData.category);
      setValue("amountCents", initialData.amountCents);
      setValue("description", initialData.description);

      const inList = finalCategories.includes(initialData.category);
      if (!inList && finalCategories.length > 0) {
        setIsCustomCategory(true);
      }
    }
  }, [initialData, setValue, finalCategories]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        {/* التاريخ */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-date`}
            className="text-sm font-bold text-ink/75"
          >
            تاريخ المصروف
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

        {/* فئة المصروف */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-category`}
            className="text-sm font-bold text-ink/75"
          >
            الفئة
          </label>
          {!isCustomCategory && finalCategories.length > 0 ? (
            <select
              id={`${formId}-category-select`}
              value={watch("category")}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "custom") {
                  setIsCustomCategory(true);
                  setValue("category", "");
                } else {
                  setValue("category", val);
                }
              }}
              className="flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="">-- اختر الفئة --</option>
              {finalCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="custom">أخرى (إدخال يدوي) ...</option>
            </select>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                id={`${formId}-category`}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                placeholder="أدخل اسم الفئة..."
                {...register("category")}
                className={`flex-1 h-11 px-3 py-2 rounded-md border border-hairline bg-paper text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  errors.category ? "border-alert" : ""
                }`}
              />
              {finalCategories.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false);
                    setValue("category", finalCategories[0] || "");
                  }}
                  className="h-11 px-3 border border-hairline hover:bg-canvas rounded-md text-xs text-ink-2 shrink-0"
                >
                  اختر من القائمة
                </button>
              )}
            </div>
          )}
          {errors.category && (
            <p className="text-xs text-alert mt-1">
              {errors.category.message as string}
            </p>
          )}
        </div>

        {/* القيمة */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-amount`}
            className="text-sm font-bold text-ink/75"
          >
            المبلغ الإجمالي
          </label>
          <Controller
            name="amountCents"
            control={control}
            render={({ field }) => (
              <MoneyInput
                value={Number(field.value) || 0}
                onChange={field.onChange}
                disabled={isSubmitting}
                error={errors.amountCents?.message as string}
              />
            )}
          />
          {errors.amountCents && (
            <p className="text-xs text-alert mt-1">
              {errors.amountCents.message as string}
            </p>
          )}
        </div>

        {/* الوصف */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-description`}
            className="text-sm font-bold text-ink/75"
          >
            بيان وتفاصيل المصروف
          </label>
          <textarea
            id={`${formId}-description`}
            placeholder=""
            {...register("description")}
            className={`flex min-h-[80px] w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
              errors.description ? "border-alert" : ""
            }`}
          />
          {errors.description && (
            <p className="text-xs text-alert mt-1">
              {errors.description.message as string}
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
              : "إضافة المصروف"}
        </button>

        {initialData && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSubmitting}
            className="h-12 w-12 border border-alert text-alert rounded-md flex items-center justify-center hover:bg-alert/5 disabled:opacity-50 transition-colors"
            title="حذف المصروف"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </form>
  );
}
