"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { List, Trash2, Settings2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { expenseInputSchema } from "../schema";
import type { Expense, NewExpense } from "../types";
import { useExpenseCategoryCatalog } from "../hooks";

interface ExpenseFormProps {
  initialData?: Expense | null;
  /** دالة الحفظ. تستقبل القيم + علم «التصنيف المتقدّم» (Phase 4) ليعرف الأب
   * إن كان يجب أن يعرض مودال الإهلاك بعد النجاح. الأب مسؤول عن mutateAsync
   * والحصول على res.data.id ثم عرض DepreciationPromptModal. */
  onSubmit: (values: NewExpense, advancedClassification: boolean) => void;
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
  const [isCustomCategory, setIsCustomCategory] = useState(
    !initialData?.category,
  );

  // جلب الفئات الشائعة
  const { data: dbCategories = [] } = useExpenseCategoryCatalog();

  // دمج الفئات الافتراضية مع الفئات القادمة من الـ Props وقاعدة البيانات
  const finalCategories = Array.from(
    new Set([
      ...categories,
      ...dbCategories.map((c) => c.name),
      ...(initialData?.category ? [initialData.category] : []),
    ]),
  );

  // Phase 4 — toggle «تصنيف متقدّم» (مغلق افتراضياً). المستخدم العادي يكتفي
  // بـ checkbox «أصل رأسمالي» (Phase 2 — يُفصَل عن الربح التشغيلي). من يريد
  // الإهلاك يفتح الـ toggle، فبعد حفظ صف رأسمالي يظهر مودال السؤال.
  const [advancedClassification, setAdvancedClassification] = useState(false);

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toLocaleDateString("en-CA") ?? "")
      : new Date().toLocaleDateString("en-CA"),
    category: initialData?.category || "",
    amountCents: initialData?.amountCents || 0,
    description: initialData?.description || "",
    // Phase 2 — التصنيف بُعدين: افتراضي false/'variable'.
    isCapitalAsset: initialData?.isCapitalAsset ?? false,
    costNature: initialData?.costNature ?? "variable",
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

  // Phase 2 — نراقب isCapitalAsset لإظهار/إخفاء حقل طبيعة التكلفة.
  const isCapital = watch("isCapitalAsset");

  useEffect(() => {
    if (initialData) {
      setValue(
        "date",
        new Date(initialData.date).toLocaleDateString("en-CA") ?? "",
      );
      setValue("category", initialData.category);
      setValue("amountCents", initialData.amountCents);
      setValue("description", initialData.description || "");
      setValue("isCapitalAsset", initialData.isCapitalAsset ?? false);
      setValue("costNature", initialData.costNature ?? "variable");
      setIsCustomCategory(!finalCategories.includes(initialData.category));
    }
  }, [initialData, setValue, finalCategories]);

  // مُغلِّف onSubmit: يُمرِّر قيم الفورم + علم «التصنيف المتقدّم» للأب. الأب
  // مسؤول عن mutateAsync والحصول على res.data.id، ثم يقرّر عرض مودال الإهلاك
  // (إن كان isCapitalAsset && advancedClassification). لو لم يكن رأسمالياً أو
  // لم يكن الـ toggle مفتوحاً، يُسلَّم السلوك للـ Phase 2 الافتراضي.
  const handleSubmitWrapper = (values: NewExpense) => {
    onSubmit(values, advancedClassification);
  };

  return (
    <form onSubmit={handleSubmit(handleSubmitWrapper)} className="space-y-6">
      <div className="space-y-4">
        {/* التاريخ */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-date`}
            className="text-sm font-bold text-ink/75"
          >
            تاريخ الصرف
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

        {/* فئة المصروف */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-category`}
            className="text-sm font-bold text-ink/75"
          >
            الفئة
          </label>
          {!isCustomCategory && finalCategories.length > 0 ? (
            <Select
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
              error={errors.category?.message as string}
            >
              <option value="">-- اختر الفئة --</option>
              {finalCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="custom">أخرى (إدخال يدوي) ...</option>
            </Select>
          ) : (
            <div className="flex gap-2 items-center">
              <input
                id={`${formId}-category`}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                placeholder="أدخل اسم الفئة..."
                {...register("category")}
                className={`min-w-0 flex-1 h-12 px-4 py-2 rounded-md border border-hairline bg-paper text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  errors.category ? "border-alert" : ""
                }`}
              />
              {finalCategories.length > 0 && (
                <Button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false);
                    setValue("category", finalCategories[0] || "");
                  }}
                  variant="secondary"
                  size="icon"
                  aria-label="اختيار من الفئات المخزّنة"
                  title="اختيار من الفئات المخزّنة"
                  className="h-12 w-12 shrink-0"
                >
                  <List className="w-5 h-5" />
                </Button>
              )}
            </div>
          )}
          {isCustomCategory && errors.category && (
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
            المبلغ المصروف
          </label>
          <Controller
            name="amountCents"
            control={control}
            render={({ field }) => (
              <MoneyInput
                value={Number(field.value) || 0}
                onChange={field.onChange}
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
        <TextArea
          label="بيان وتفاصيل المصروف"
          id={`${formId}-description`}
          placeholder=""
          {...register("description")}
          error={errors.description?.message as string}
        />

        {/* Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر). */}
        <div className="space-y-3 p-3.5 bg-canvas/30 rounded-lg border border-hairline">
          {/* بُعد 1: رأسمالي؟ */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id={`${formId}-capital`}
              {...register("isCapitalAsset")}
              className="h-5 w-5 rounded border-hairline-2 text-info focus:ring-info"
            />
            <label
              htmlFor={`${formId}-capital`}
              className="text-sm font-bold text-ink/75 cursor-pointer"
            >
              أصل رأسمالي (يُهلَك عبر الزمن، لا يُخصم من الربح التشغيلي)
            </label>
          </div>

          {/* بُعد 2: الطبيعة (يظهر إن لم يكن رأسمالياً) */}
          {!isCapital && (
            <div className="space-y-2 flex flex-col">
              <label
                htmlFor={`${formId}-cost-nature`}
                className="text-sm font-bold text-ink/75"
              >
                طبيعة التكلفة
              </label>
              <select
                id={`${formId}-cost-nature`}
                {...register("costNature")}
                className="flex h-12 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-base text-ink text-start focus:outline-none focus:ring-2 focus:ring-ink"
              >
                <option value="variable">متغيّرة (خامات، تغليف، وقود)</option>
                <option value="fixed">ثابتة (إيجار، اشتراك، رواتب)</option>
              </select>
            </div>
          )}

          {/* Phase 4 — toggle «تصنيف متقدّم» (spec card 4.E).
              مغلق افتراضياً. المستخدم العادي يكتفي بـ checkbox «أصل رأسمالي».
              من يريد الإهلاك يفتح الـ toggle، فبعد حفظ صف رأسمالي يظهر مودال
              السؤال: «خصم مرة واحدة» (سلوك Phase 2 الافتراضي) أو «توزيع شهري». */}
          {isCapital && (
            <div className="pt-2 border-t border-hairline mt-2">
              <button
                type="button"
                onClick={() => setAdvancedClassification((v) => !v)}
                className="flex items-center gap-2 text-xs text-info hover:underline min-h-[40px] px-1 -my-1"
                aria-expanded={advancedClassification}
              >
                <Settings2 className="w-3.5 h-3.5" />
                {advancedClassification
                  ? "إخفاء التصنيف المتقدّم"
                  : "تصنيف متقدّم (إهلاك شهري)"}
              </button>
              {advancedClassification && (
                <p className="text-[11px] text-ink-3 leading-relaxed mt-1.5 ps-5">
                  بعد الحفظ، سيُسأل المستخدم: هل يريد خصم هذا الأصل مرة واحدة
                  (افتراضي Phase 2 — لا يؤثّر على الربح التشغيلي) أو توزيعه شهرياً
                  كإهلاك (يُخصَم شهرياً من الربح التشغيلي طوال عمر الأصل النافع)؟
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="ink"
          isLoading={isSubmitting}
          className="flex-1"
        >
          {initialData ? "حفظ التعديلات" : "إضافة المصروف"}
        </Button>

        {initialData && onDelete && (
          <Button
            variant="icon"
            onClick={onDelete}
            disabled={isSubmitting}
            className="text-alert border-alert hover:bg-alert/5"
            title="حذف المصروف"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        )}
      </div>
    </form>
  );
}
