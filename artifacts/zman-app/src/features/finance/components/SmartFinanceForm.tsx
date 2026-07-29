"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SmartFinanceForm — نموذج إدخال ذكي موحَّد للمالك (جولة UX #3)
// ─────────────────────────────────────────────────────────────────────────────
// ثلاثة أوضاع تُحدَّد بسيلكتور مرئي في الأعلى:
//   1. «مصروف يومي»  → createExpense(isCapitalAsset=false, costNature='variable')
//   2. «شراء مواد»   → createPurchase مع ربط اختياري بصنف متتبَّع
//   3. «أصل للورشة»  → createExpense(isCapitalAsset=true) + DepreciationPromptModal
//
// لا يُلمَس أي منطق محاسبي أو قاعدة بيانات — إعادة استخدام كاملة لـ:
//   createExpense, createPurchase, addCapitalAsset, DepreciationPromptModal
// ─────────────────────────────────────────────────────────────────────────────

import { zodResolver } from "@hookform/resolvers/zod";
import { Banknote, ShoppingBag, Wrench } from "lucide-react";
import { useMemo, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { MoneyInput } from "@/components/shared/MoneyInput";
import { Button } from "@/components/shared/Button";
import { Select } from "@/components/shared/Select";
import { TextArea } from "@/components/shared/TextArea";
import { formatFilsToJod } from "@/lib/money";

import {
  useCreateExpense,
  useCreatePurchase,
  useExpenseCategoryCatalog,
} from "../hooks";
import { useAddCapitalAsset } from "@/features/depreciation/hooks";
import { DepreciationPromptModal } from "@/features/depreciation/components/DepreciationPromptModal";
import { useCatalogComponents } from "@/features/catalog/hooks";
import { useComponentStock } from "@/features/inventory/hooks";

// ── أوضاع النموذج ────────────────────────────────────────────────────────────

type Mode = "expense" | "purchase" | "asset";

const MODES: { id: Mode; label: string; icon: React.ReactNode }[] = [
  { id: "expense", label: "مصروف يومي", icon: <Banknote className="w-4 h-4" /> },
  { id: "purchase", label: "شراء مواد", icon: <ShoppingBag className="w-4 h-4" /> },
  { id: "asset", label: "أصل للورشة", icon: <Wrench className="w-4 h-4" /> },
];

// ── مخططات التحقق ────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  category: z.string().min(1, "الفئة مطلوبة").max(200),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().max(1000).default(""),
});

const purchaseSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  catalogId: z.string().nullable().default(null),
  itemName: z.string().min(1, "اسم الصنف مطلوب").max(200),
  quantity: z.coerce
    .number()
    .int()
    .positive("الكمية يجب أن تكون أكبر من 0"),
  totalCents: z.coerce
    .number()
    .int()
    .positive("الإجمالي يجب أن يكون أكبر من 0"),
  notes: z.string().max(1000).default(""),
});

const assetSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "التاريخ غير صالح" }),
  name: z.string().min(1, "اسم الأصل مطلوب").max(200),
  amountCents: z.coerce
    .number()
    .int()
    .positive("المبلغ يجب أن يكون أكبر من 0"),
  description: z.string().max(1000).default(""),
  wantDepreciation: z.boolean().default(false),
});

type ExpenseValues = z.infer<typeof expenseSchema>;
type PurchaseValues = z.infer<typeof purchaseSchema>;
type AssetValues = z.infer<typeof assetSchema>;

// ── واجهة المكوّن ─────────────────────────────────────────────────────────────

interface SmartFinanceFormProps {
  /** استدعاء بعد أي نجاح (يُخبر الأب بإعادة جلب القائمة) */
  onSuccess: () => void;
  /** إغلاق المودال */
  onClose: () => void;
}

// ── المكوّن ────────────────────────────────────────────────────────────────────

export function SmartFinanceForm({ onSuccess, onClose }: SmartFinanceFormProps) {
  const [mode, setMode] = useState<Mode>("expense");
  const id = useId();

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createExpense = useCreateExpense();
  const createPurchase = useCreatePurchase();
  const addCapitalAsset = useAddCapitalAsset();

  // ── مودال الإهلاك (وضع «أصل للورشة»)  ───────────────────────────────────
  const [pendingAsset, setPendingAsset] = useState<{
    sourceId: string;
    name: string;
    date: string;
    amountCents: number;
  } | null>(null);

  // ── بيانات الكتالوج (وضع «شراء مواد») ────────────────────────────────────
  const { data: allCatalogItems = [] } = useCatalogComponents();
  const trackedItems = useMemo(
    () => allCatalogItems.filter((c) => c.tracked),
    [allCatalogItems],
  );
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const { data: currentStock } = useComponentStock(selectedCatalogId ?? undefined);
  const selectedItem = useMemo(
    () => trackedItems.find((i) => i.id === selectedCatalogId),
    [trackedItems, selectedCatalogId],
  );
  const [isCustomItem, setIsCustomItem] = useState(false);

  // ── فئات المصاريف (وضع «مصروف يومي») ────────────────────────────────────
  const { data: dbCategories = [] } = useExpenseCategoryCatalog();
  const categoryOptions = useMemo(
    () => Array.from(new Set(dbCategories.map((c) => c.name))),
    [dbCategories],
  );
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  const today = new Date().toLocaleDateString("en-CA");

  // ── نماذج RHF (واحد لكل وضع) ─────────────────────────────────────────────
  const expenseForm = useForm<ExpenseValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { date: today, category: "", amountCents: 0, description: "" },
  });

  const purchaseForm = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      date: today,
      catalogId: null,
      itemName: "",
      quantity: 1,
      totalCents: 0,
      notes: "",
    },
  });

  const assetForm = useForm<AssetValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      date: today,
      name: "",
      amountCents: 0,
      description: "",
      wantDepreciation: false,
    },
  });

  // ── تبديل الوضع + إعادة ضبط الحالة ──────────────────────────────────────
  const handleModeChange = (m: Mode) => {
    setMode(m);
    setIsCustomItem(false);
    setIsCustomCategory(false);
    setSelectedCatalogId(null);
    expenseForm.reset({ date: today, category: "", amountCents: 0, description: "" });
    purchaseForm.reset({ date: today, catalogId: null, itemName: "", quantity: 1, totalCents: 0, notes: "" });
    assetForm.reset({ date: today, name: "", amountCents: 0, description: "", wantDepreciation: false });
  };

  // ── handlers per mode ─────────────────────────────────────────────────────

  const handleExpenseSubmit = async (values: ExpenseValues) => {
    const res = await createExpense.mutateAsync({
      values: {
        date: values.date,
        category: values.category,
        amountCents: values.amountCents,
        description: values.description || "",
        isCapitalAsset: false,
        costNature: "variable",
      },
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المصروف");
      onSuccess();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  const handlePurchaseSubmit = async (values: PurchaseValues) => {
    const qty = values.quantity;
    const unitCostMicroCents =
      qty > 0 ? Math.round((values.totalCents * 1000) / qty) : values.totalCents * 1000;

    const res = await createPurchase.mutateAsync({
      values: {
        date: values.date,
        item: values.itemName,
        supplier: "",
        quantity: qty,
        unitCostMicroCents,
        notes: values.notes || "",
        isCapitalAsset: false,
        costNature: "variable",
        linkedCatalogComponentId: values.catalogId ?? null,
      },
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل شراء المواد");
      onSuccess();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  const handleAssetSubmit = async (values: AssetValues) => {
    const res = await createExpense.mutateAsync({
      values: {
        date: values.date,
        category: values.name,
        amountCents: values.amountCents,
        description: values.description || "",
        isCapitalAsset: true,
        costNature: undefined,
      },
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل الأصل");
      if (
        values.wantDepreciation &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        setPendingAsset({
          sourceId: (res.data as { id: string }).id,
          name: values.name,
          date: values.date,
          amountCents: values.amountCents,
        });
        // لا نُغلق المودال الآن — DepreciationPromptModal سيُشغَّل
      } else {
        onSuccess();
        onClose();
      }
    } else {
      toast.error(res.message);
    }
  };

  const handleConfirmSpread = async (months: number) => {
    if (!pendingAsset) return;
    const res = await addCapitalAsset.mutateAsync({
      sourceType: "expense",
      sourceId: pendingAsset.sourceId,
      name: pendingAsset.name,
      purchaseDate: pendingAsset.date,
      purchaseAmountCents: pendingAsset.amountCents,
      usefulLifeMonths: months,
    });
    if (res.status === "ok") {
      toast.success(
        `إهلاك ${formatFilsToJod(res.data.monthlyDepreciationCents)} شهرياً لمدة ${res.data.usefulLifeMonths} شهراً`,
      );
    } else {
      toast.error(res.message);
    }
    setPendingAsset(null);
    onSuccess();
    onClose();
  };

  const handleConfirmDeductOnce = () => {
    toast.info("تم تسجيل الأصل كإضافة رأسمالية — لا إهلاك شهري");
    setPendingAsset(null);
    onSuccess();
    onClose();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const isExpensePending = createExpense.isPending;
  const isPurchasePending = createPurchase.isPending;

  return (
    <>
      {/* السيلكتور — ثلاثة أوضاع */}
      <div
        className="flex gap-1 p-1 bg-canvas rounded-xl mb-6"
        role="tablist"
        aria-label="نوع العملية"
      >
        {MODES.map(({ id: mId, label, icon }) => (
          <button
            key={mId}
            type="button"
            role="tab"
            aria-selected={mode === mId}
            onClick={() => handleModeChange(mId)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg text-xs font-bold transition-all min-h-[56px] ${
              mode === mId
                ? "bg-paper text-ink shadow-sm"
                : "text-ink/50 hover:text-ink/80"
            }`}
          >
            <span className={mode === mId ? "text-info" : ""}>{icon}</span>
            <span className="leading-tight text-center">{label}</span>
          </button>
        ))}
      </div>

      {/* ── وضع 1: مصروف يومي ─────────────────────────────────────────────── */}
      {mode === "expense" && (
        <form
          onSubmit={expenseForm.handleSubmit(handleExpenseSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">التاريخ</label>
            <input
              type="date"
              {...expenseForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${expenseForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {expenseForm.formState.errors.date && (
              <p className="text-xs text-alert">{expenseForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* الفئة */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">الفئة</label>
            {!isCustomCategory && categoryOptions.length > 0 ? (
              <Select
                value={expenseForm.watch("category")}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setIsCustomCategory(true);
                    expenseForm.setValue("category", "");
                  } else {
                    expenseForm.setValue("category", e.target.value);
                  }
                }}
                error={expenseForm.formState.errors.category?.message}
              >
                <option value="">-- اختر الفئة --</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom__">أخرى (إدخال يدوي)...</option>
              </Select>
            ) : (
              <input
                type="text"
                placeholder="أدخل اسم الفئة..."
                {...expenseForm.register("category")}
                className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  expenseForm.formState.errors.category ? "border-alert" : "border-hairline"
                }`}
              />
            )}
            {expenseForm.formState.errors.category && (
              <p className="text-xs text-alert">
                {expenseForm.formState.errors.category.message}
              </p>
            )}
          </div>

          {/* المبلغ */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">المبلغ</label>
            <Controller
              name="amountCents"
              control={expenseForm.control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={field.onChange}
                  error={expenseForm.formState.errors.amountCents?.message}
                />
              )}
            />
          </div>

          {/* ملاحظة */}
          <TextArea
            label="ملاحظة (اختياري)"
            id={`${id}-expense-notes`}
            placeholder=""
            {...expenseForm.register("description")}
          />

          <Button
            type="submit"
            variant="ink"
            isLoading={isExpensePending}
            className="w-full"
          >
            تسجيل المصروف
          </Button>
        </form>
      )}

      {/* ── وضع 2: شراء مواد ──────────────────────────────────────────────── */}
      {mode === "purchase" && (
        <form
          onSubmit={purchaseForm.handleSubmit(handlePurchaseSubmit)}
          className="space-y-4"
        >
          {/* رسالة توعوية: شراء المخزون ≠ خسارة */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <span className="text-base leading-none mt-0.5" aria-hidden="true">✅</span>
            <p className="text-xs text-emerald-800 leading-relaxed">
              <strong>هذا المبلغ لم يُضَف لمصاريفك</strong> — سيُضاف لقيمة مخزونك.
              الربح يتأثر فقط عند تسليم الطلبات (تكلفة البضاعة المباعة).
            </p>
          </div>

          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">تاريخ الشراء</label>
            <input
              type="date"
              {...purchaseForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${purchaseForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {purchaseForm.formState.errors.date && (
              <p className="text-xs text-alert">{purchaseForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* الصنف — من الكتالوج المتتبَّع */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">الصنف</label>

            {!isCustomItem && trackedItems.length > 0 ? (
              <Select
                value={selectedCatalogId ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "__custom__") {
                    setIsCustomItem(true);
                    setSelectedCatalogId(null);
                    purchaseForm.setValue("catalogId", null);
                    purchaseForm.setValue("itemName", "");
                  } else {
                    const item = trackedItems.find((i) => i.id === val);
                    setSelectedCatalogId(val || null);
                    purchaseForm.setValue("catalogId", val || null);
                    purchaseForm.setValue("itemName", item?.name ?? "");
                  }
                }}
                error={purchaseForm.formState.errors.itemName?.message}
              >
                <option value="">-- اختر صنفاً --</option>
                {trackedItems.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.unit})
                  </option>
                ))}
                <option value="__custom__">أخرى (غير مرتبط بالمخزون)...</option>
              </Select>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="اسم الصنف..."
                  {...purchaseForm.register("itemName")}
                  className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                    purchaseForm.formState.errors.itemName ? "border-alert" : "border-hairline"
                  }`}
                />
                {trackedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomItem(false);
                      purchaseForm.setValue("itemName", "");
                      purchaseForm.setValue("catalogId", null);
                    }}
                    className="text-xs text-info hover:underline"
                  >
                    ← اختر من الكتالوج
                  </button>
                )}
              </div>
            )}
            {purchaseForm.formState.errors.itemName && (
              <p className="text-xs text-alert">
                {purchaseForm.formState.errors.itemName.message}
              </p>
            )}
            {trackedItems.length === 0 && (
              <p className="text-[11px] text-ink/50">
                لا توجد أصناف متتبَّعة — فعِّل تتبّع صنف من صفحة الكتالوج أولاً.
              </p>
            )}

            {/* معاينة تأثير الربط على المخزون */}
            {selectedItem && (
              <div className="p-2.5 rounded-md bg-info/10 text-info text-xs flex items-center justify-between gap-2">
                <span>
                  سيُضاف{" "}
                  <strong>{purchaseForm.watch("quantity") || 0}</strong>{" "}
                  {selectedItem.unit} للمخزون عند الحفظ.
                </span>
                <span className="opacity-70">
                  الرصيد الحالي:{" "}
                  <strong>{currentStock ?? 0}</strong>
                </span>
              </div>
            )}
          </div>

          {/* الكمية + الإجمالي */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-bold text-ink/75">الكمية</label>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                {...purchaseForm.register("quantity", { valueAsNumber: true })}
                className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                  purchaseForm.formState.errors.quantity ? "border-alert" : "border-hairline"
                }`}
              />
              {purchaseForm.formState.errors.quantity && (
                <p className="text-xs text-alert">
                  {purchaseForm.formState.errors.quantity.message}
                </p>
              )}
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-bold text-ink/75">إجمالي التكلفة</label>
              <Controller
                name="totalCents"
                control={purchaseForm.control}
                render={({ field }) => (
                  <MoneyInput
                    value={Number(field.value) || 0}
                    onChange={field.onChange}
                    error={purchaseForm.formState.errors.totalCents?.message}
                  />
                )}
              />
            </div>
          </div>

          {/* سعر الوحدة — للعرض فقط */}
          {(() => {
            const qty = purchaseForm.watch("quantity") || 0;
            const total = purchaseForm.watch("totalCents") || 0;
            return qty > 0 && total > 0 ? (
              <div className="p-3 bg-canvas/40 rounded-lg border border-hairline flex items-center justify-between text-sm">
                <span className="text-ink/60">سعر الوحدة:</span>
                <strong className="text-info" dir="ltr">
                  {formatFilsToJod(Math.floor(total / qty))}
                </strong>
              </div>
            ) : null;
          })()}

          {/* ملاحظات */}
          <TextArea
            label="ملاحظات (اختياري)"
            id={`${id}-purchase-notes`}
            placeholder=""
            {...purchaseForm.register("notes")}
          />

          <Button
            type="submit"
            variant="ink"
            isLoading={isPurchasePending}
            className="w-full"
          >
            تسجيل الشراء
          </Button>
        </form>
      )}

      {/* ── وضع 3: أصل للورشة ─────────────────────────────────────────────── */}
      {mode === "asset" && (
        <form
          onSubmit={assetForm.handleSubmit(handleAssetSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">تاريخ الشراء</label>
            <input
              type="date"
              {...assetForm.register("date")}
              className={`flex h-12 w-full rounded-md border bg-paper px-3 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${assetForm.formState.errors.date ? "border-alert" : "border-hairline"}`}
            />
            {assetForm.formState.errors.date && (
              <p className="text-xs text-alert">{assetForm.formState.errors.date.message}</p>
            )}
          </div>

          {/* اسم الأصل */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">اسم الأصل</label>
            <input
              type="text"
              placeholder="مثال: ثلاجة العرض، آلة الري..."
              {...assetForm.register("name")}
              className={`flex h-12 w-full rounded-md border bg-paper px-4 py-2 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ink ${
                assetForm.formState.errors.name ? "border-alert" : "border-hairline"
              }`}
            />
            {assetForm.formState.errors.name && (
              <p className="text-xs text-alert">
                {assetForm.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* قيمة الشراء */}
          <div className="space-y-2 flex flex-col">
            <label className="text-sm font-bold text-ink/75">قيمة الشراء</label>
            <Controller
              name="amountCents"
              control={assetForm.control}
              render={({ field }) => (
                <MoneyInput
                  value={Number(field.value) || 0}
                  onChange={field.onChange}
                  error={assetForm.formState.errors.amountCents?.message}
                />
              )}
            />
          </div>

          {/* ملاحظات */}
          <TextArea
            label="ملاحظات (اختياري)"
            id={`${id}-asset-desc`}
            placeholder="تفاصيل إضافية عن الأصل..."
            {...assetForm.register("description")}
          />

          {/* إهلاك شهري */}
          <div className="p-3.5 bg-canvas/30 rounded-lg border border-hairline">
            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                {...assetForm.register("wantDepreciation")}
                className="h-5 w-5 rounded border-hairline text-info focus:ring-info shrink-0"
              />
              <span className="text-sm font-bold text-ink/75">
                توزيع الإهلاك شهرياً
              </span>
            </label>
            {assetForm.watch("wantDepreciation") && (
              <p className="text-[11px] text-ink/50 mt-1.5 leading-relaxed pe-2">
                بعد الحفظ، ستُحدَّد عدد أشهر الإهلاك ويُخصَم مبلغ شهري ثابت من الربح
                التشغيلي. إن تركته بدون تحديد، يُسجَّل كإضافة رأسمالية مرة واحدة.
              </p>
            )}
          </div>

          <Button
            type="submit"
            variant="ink"
            isLoading={isExpensePending}
            className="w-full"
          >
            تسجيل الأصل
          </Button>
        </form>
      )}

      {/* مودال الإهلاك — يُفتح بعد حفظ «أصل للورشة» مع تفعيل الإهلاك */}
      <DepreciationPromptModal
        isOpen={pendingAsset !== null}
        onClose={handleConfirmDeductOnce}
        assetName={pendingAsset?.name ?? ""}
        purchaseAmountCents={pendingAsset?.amountCents ?? 0}
        onConfirmDeductOnce={handleConfirmDeductOnce}
        onConfirmSpread={handleConfirmSpread}
        isSubmitting={addCapitalAsset.isPending}
      />
    </>
  );
}
