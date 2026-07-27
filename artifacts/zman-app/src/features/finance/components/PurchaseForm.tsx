"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { List, Trash2, Boxes, PackageCheck, Settings2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AmountText } from "@/components/shared/AmountText";
import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
// SA3 — formatFilsToJod لعرض سعر القطعة الواحدة بدل toLocaleString الخام.
import { formatFilsToJod } from "@/lib/money";
import { purchaseInputSchema } from "../schema";
import type { NewPurchase, Purchase } from "../types";
import { usePurchaseItemCatalog } from "../hooks";
// Phase 3 — ربط بصنف الكتالوج المتتبَّع.
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useComponentStock } from "@/features/inventory/hooks";

interface PurchaseFormProps {
  initialData?: Purchase | null;
  /** دالة الحفظ. تستقبل القيم + علم «التصنيف المتقدّم» (Phase 4) ليعرف الأب
   * إن كان يجب أن يعرض مودال الإهلاك بعد النجاح. الأب مسؤول عن mutateAsync
   * والحصول على res.data.id ثم عرض DepreciationPromptModal. */
  onSubmit: (values: NewPurchase, advancedClassification: boolean) => void;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleManageCatalog = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("newPurchase");   // أغلق فورم الإضافة
    params.delete("editPurchase");  // أغلق فورم التعديل إن كان مفتوحاً
    params.set("manageCatalog", "purchases");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [isCustomItem, setIsCustomItem] = useState(!initialData?.item);

  // Phase 4 — toggle «تصنيف متقدّم» (مغلق افتراضياً). المستخدم العادي يكتفي
  // بـ checkbox «أصل رأسمالي» (Phase 2). من يريد الإهلاك يفتح الـ toggle، فبعد
  // حفظ صف رأسمالي يظهر مودال السؤال.
  const [advancedClassification, setAdvancedClassification] = useState(false);

  // جلب العناصر الشائعة للمشتريات
  const { data: catalogItems = [] } = usePurchaseItemCatalog();
  // Phase 3 — جلب أصناف الكتالوج (للربط بالصنف المتتبَّع). نفلتر محلياً للأصناف
  // المتتبَّعة فقط — الـ UI يمنع المستخدم من ربط فاتورة بصنف غير متتبَّع، لكن
  // الخادم يتحقق أيضاً ويرمي خطأً صريحاً إن تُخطِّي.
  const { data: trackedCatalogItems = [] } = useCatalogComponents();
  const trackedItems = useMemo(
    () => trackedCatalogItems.filter((c) => c.tracked),
    [trackedCatalogItems],
  );

  const defaultValues = {
    date: initialData
      ? (new Date(initialData.date).toLocaleDateString("en-CA") ?? "")
      : new Date().toLocaleDateString("en-CA"),
    item: initialData?.item || "",
    supplier: initialData?.supplier || "",
    quantity: initialData?.quantity || 1,
    // المصدر الأساسي المُرسَل: سعر الوحدة عالي الدقّة (ميلي-fils).
    unitCostMicroCents: initialData?.unitCostMicroCents || 0,
    // حقلا عرض فقط (fils صحيح) — لا يُرسَلان للخادم.
    unitCostCents: initialData?.unitCostCents || 0,
    totalCents: initialData?.totalCents || 0,
    notes: initialData?.notes || "",
    // Phase 2 — التصنيف بُعدين: افتراضي false/'variable'.
    isCapitalAsset: initialData?.isCapitalAsset ?? false,
    costNature: initialData?.costNature ?? "variable",
    // Phase 3 — الربط بصنف الكتالوج (nullable).
    linkedCatalogComponentId: initialData?.linkedCatalogComponentId ?? null,
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

  // Phase 2 — نراقب isCapitalAsset لإظهار/إخفاء حقل طبيعة التكلفة.
  const isCapital = watch("isCapitalAsset");

  // Phase 3 — نراقب linkedCatalogComponentId لعرض تأثير الربط على المخزون.
  const watchedLinkedCatalogComponentId = watch("linkedCatalogComponentId");
  const watchQty = watch("quantity") || 0;
  const watchUnitCost = watch("unitCostCents") || 0;
  const watchTotal = watch("totalCents") || 0;

  // اجلب رصيد الصنف المرتبط حالياً لعرضه أسفل الحقل.
  const { data: linkedStock } = useComponentStock(
    watchedLinkedCatalogComponentId ?? undefined,
  );

  const linkedItem = useMemo(
    () => trackedItems.find((i) => i.id === watchedLinkedCatalogComponentId),
    [trackedItems, watchedLinkedCatalogComponentId],
  );

  // يحسب سعر الوحدة عالي الدقّة (ميلي-fils) من الإجمالي والكمية بلا فقدان كسر.
  const microFromTotal = (totalFils: number, qty: number) =>
    qty > 0 ? Math.round((totalFils * 1000) / qty) : 0;

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
    // الفردي (fils صحيح) هو المصدر هنا → micro = fils×1000، والإجمالي دقيق.
    setValue("unitCostMicroCents", value * 1000);
    setValue("totalCents", Math.round(value * qty));
  };

  const handleTotalChange = (value: number) => {
    lastEdited.current = "total";
    setValue("totalCents", value);
    const qty = watch("quantity") || 0;
    // الإجمالي هو المصدر → micro يحمل الكسر بحيث micro×qty/1000 = الإجمالي.
    setValue("unitCostMicroCents", microFromTotal(value, qty));
    setValue("unitCostCents", qty > 0 ? Math.round(value / qty) : 0);
  };

  // عند تغيّر الكمية: نعيد الحساب حسب آخر حقل عدّله المستخدم
  useEffect(() => {
    if (lastEdited.current === "total") {
      // الإجمالي ثابت (هو الحقيقة) → أعد اشتقاق الفردي عالي الدقّة والمعروض.
      setValue("unitCostMicroCents", microFromTotal(watchTotal, watchQty));
      setValue(
        "unitCostCents",
        watchQty > 0 ? Math.round(watchTotal / watchQty) : 0,
      );
    } else {
      // الفردي ثابت → أعد حساب الإجمالي وحدّث micro.
      setValue("unitCostMicroCents", watchUnitCost * 1000);
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
      setValue("unitCostMicroCents", initialData.unitCostMicroCents ?? initialData.unitCostCents * 1000);
      setValue("unitCostCents", initialData.unitCostCents);
      setValue("totalCents", initialData.totalCents);
      setValue("notes", initialData.notes || "");
      setValue("isCapitalAsset", initialData.isCapitalAsset ?? false);
      setValue("costNature", initialData.costNature ?? "variable");
      setValue("linkedCatalogComponentId", initialData.linkedCatalogComponentId ?? null);
      setIsCustomItem(!catalogItems.some((c) => c.name === initialData.item));
    }
  }, [initialData, setValue, catalogItems]);

  return (
    <form
      onSubmit={handleSubmit((vals) => onSubmit(vals, advancedClassification))}
      className="space-y-6"
    >
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
          <div className="flex items-center justify-between">
            <label
              htmlFor={`${formId}-item`}
              className="text-sm font-bold text-ink/75"
            >
              بيان المواد / الأصناف
            </label>
            <button
              type="button"
              onClick={handleManageCatalog}
              className="text-xs text-info hover:underline flex items-center gap-1.5 min-h-[44px] px-2 -my-2.5"
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>إدارة الأصناف</span>
            </button>
          </div>
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
                  type="button"
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

        {/* Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر).
            Phase 3 — أُضيف حقل «صنف الكتالوج المرتبط» (كان مؤجَّلاً من 2.J). */}
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
              أصل رأسمالي (آلة، أثاث، معدات — يُهلَك عبر الزمن، لا يُخصم من الربح التشغيلي)
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
              {/* SA3: استبدال <select> الخام بمكوّن <Select> المشترك لمطابقة SA2 baseline §2.5. */}
              <Select
                id={`${formId}-cost-nature`}
                {...register("costNature")}
              >
                <option value="variable">متغيّرة (خامات، تغليف، وقود)</option>
                <option value="fixed">ثابتة (إيجار، اشتراك، رواتب)</option>
              </Select>
            </div>
          )}

          {/* Phase 4 — toggle «تصنيف متقدّم» (spec card 4.E). مغلق افتراضياً.
              المستخدم العادي يكتفي بـ checkbox «أصل رأسمالي». من يريد الإهلاك
              يفتح الـ toggle، فبعد حفظ صف رأسمالي يظهر مودال السؤال. */}
          {isCapital && (
            <div className="pt-2 border-t border-hairline mt-2">
              <button
                type="button"
                onClick={() => setAdvancedClassification((v) => !v)}
                className="flex items-center gap-2 text-xs text-info hover:underline min-h-[44px] px-1 -my-1"
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

        {/* Phase 3 — ربط اختياري بصنف كتالوج متتبَّع (card 3.J).
            عند اختيار صنف متتبَّع، تُنشئ createPurchase حركة `in` في catalog_movement
            تُضيف الكمية المشتراة للرصيد. الفاتورة تظل تدخل P&L كالمعتاد (cash basis)
            لكنها تُضيف للرصيد التشغيلي أيضاً. الأصناف غير المتتبَّعة لا تظهر في القائمة. */}
        <div className="space-y-2 flex flex-col">
          <label
            htmlFor={`${formId}-linked-catalog`}
            className="text-sm font-bold text-ink/75 flex items-center gap-1.5"
          >
            <PackageCheck className="w-4 h-4 text-info" />
            ربط بصنف كتالوج متتبَّع (اختياري — يزيد رصيد المخزون)
          </label>
          {/* SA3: استبدال <select> الخام بمكوّن <Select> المشترك لمطابقة SA2 baseline §2.5. */}
          <Controller
            control={control}
            name="linkedCatalogComponentId"
            render={({ field }) => (
              <Select
                id={`${formId}-linked-catalog`}
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(e.target.value === "" ? null : e.target.value)
                }
              >
                <option value="">— لا ربط (نص حر فقط) —</option>
                {trackedItems.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.unit})
                  </option>
                ))}
              </Select>
            )}
          />
          {trackedItems.length === 0 && (
            <p className="text-[11px] text-ink-3">
              لا توجد أصناف متتبَّعة. فعِّل التتبّع على صنف من صفحة المكوّنات أولاً.
            </p>
          )}
          {/* معاينة تأثير الربط على المخزون */}
          {linkedItem && (
            <div className="p-2.5 rounded-md bg-info-soft text-info text-xs flex items-center justify-between gap-2">
              <span>
                سيُضاف <strong className="font-bold">{watchQty || 0}</strong>{" "}
                {linkedItem.unit} للمخزون عند الحفظ.
              </span>
              <span className="opacity-70">
                الرصيد الحالي: <strong className="font-bold">{linkedStock ?? 0}</strong>
              </span>
            </div>
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

        {/* سعر القطعة الواحدة — محسوب للعرض فقط. SA3: تنسيق عبر formatFilsToJod
            لمطابقة SA2 baseline §4 (money convention) بدل toLocaleString الخام + " د.أ". */}
        <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline flex items-center justify-between">
          <span className="text-sm font-bold text-ink-2">سعر القطعة الواحدة:</span>
          {watchQty > 0 ? (
            <strong className="text-lg font-extrabold text-info" dir="ltr">
              {formatFilsToJod(Math.floor(watchTotal / watchQty))}
            </strong>
          ) : (
            <span className="text-lg font-extrabold text-ink-3" dir="ltr">—</span>
          )}
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
