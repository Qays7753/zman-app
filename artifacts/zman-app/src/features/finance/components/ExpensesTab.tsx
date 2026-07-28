"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useInfiniteExpenses,
  useUpdateExpense,
} from "../hooks";
import type { NewExpense } from "../types";
import { ExpenseForm } from "./ExpenseForm";
// Phase 4 — مودال سؤال الإهلاك (خلف toggle «تصنيف متقدّم»).
import { DepreciationPromptModal } from "@/features/depreciation/components/DepreciationPromptModal";
import { useAddCapitalAsset, useDeleteCapitalAsset } from "@/features/depreciation/hooks";
import { formatFilsToJod } from "@/lib/money";

// معلومات الصف الرأسمالي المُنشَأ مؤخراً لاستخدامها في مودال الإهلاك.
interface PendingCapitalAsset {
  sourceType: "expense" | "purchase";
  sourceId: string;
  name: string;
  purchaseDate: string;
  purchaseAmountCents: number;
}
export function ExpensesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "all";
  const newExpense = searchParams.get("newExpense") === "true";
  const editId = searchParams.get("editExpense");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // D7 fix — إيقاف الإهلاك لصف capital_asset نشط. نُخزِّن المعرّف فقط ونفتح
  // ConfirmDialog للتأكيد قبل استدعاء deleteCapitalAsset.
  const [stopDepreciationAssetId, setStopDepreciationAssetId] = useState<string | null>(null);
  // Phase 4 — معلومات الصف الرأسمالي المُنشَأ مؤخراً + إظهار مودال الإهلاك.
  const [pendingCapitalAsset, setPendingCapitalAsset] =
    useState<PendingCapitalAsset | null>(null);
  const capitalAssetMutation = useAddCapitalAsset();
  const deleteCapitalAssetMutation = useDeleteCapitalAsset();

  // الفئات المعتمدة للتصفية (§5.1)
  const categoriesList = [
    "الكل",
    "رواتب",
    "إيجار",
    "كهرباء ومياه",
    "نقل وتوصيل",
    "تعبئة وتغليف",
    "صيانة وأدوات",
    "أخرى",
  ];

  // هوك جلب البيانات اللانهائي (§10.1)
  const queryCategory = category === "الكل" || category === "all" ? undefined : category;
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteExpenses({ search, category: queryCategory });

  const activeExpense = useExpense(editId || "").data;
  const isLoadingActive = useExpense(editId || "").isLoading;

  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const expenses = data?.pages.flatMap((page) => page.items) || [];

  // Phase 2 — فلتر URL اختياري `?nature=capital|fixed|variable` (يُطبَّق على
  // العميل لأن الـ infinite-scroll يجعل الفلترة في الـ server معقَّدة). إن لم
  // يُمرَّر، تُعرض كل المصاريف.
  const natureFilter = searchParams.get("nature");
  const filteredExpenses = natureFilter
    ? expenses.filter((item) => {
        if (natureFilter === "capital") return item.isCapitalAsset === true;
        if (natureFilter === "fixed") return item.isCapitalAsset === false && item.costNature === "fixed";
        if (natureFilter === "variable")
          return item.isCapitalAsset === false && (item.costNature === "variable" || !item.costNature);
        return true;
      })
    : expenses;

  // تحديث محددات الـ URL
  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };



  const handleCreate = async (
    fields: NewExpense,
    advancedClassification: boolean,
  ) => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المصروف بنجاح");
      // Phase 4 — إن كان رأسمالياً والـ toggle «تصنيف متقدّم» مفتوحاً، اعرض
      // مودال الإهلاك. وإلا فالسلوك الافتراضي Phase 2 (إضافات رأسمالية).
      if (
        fields.isCapitalAsset &&
        advancedClassification &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        setPendingCapitalAsset({
          sourceType: "expense",
          sourceId: (res.data as { id: string }).id,
          name: fields.description || fields.category || "أصل رأسمالي",
          purchaseDate: fields.date ?? new Date().toLocaleDateString("en-CA"),
          purchaseAmountCents: fields.amountCents,
        });
        // لا نُغلق مودال الفورم الآن — يُغلق عند إغلاق مودال الإهلاك.
      } else {
        updateUrl({ newExpense: null });
      }
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (
    fields: NewExpense,
    advancedClassification: boolean,
  ) => {
    if (!editId) return;
    const updatedAt = activeExpense?.updatedAt instanceof Date
      ? activeExpense.updatedAt.toISOString()
      : String(activeExpense?.updatedAt || "");
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt,
      values: fields,
    });
    if (res.status === "ok") {
      toast.success("تم تحديث بيانات المصروف بنجاح");
      // Phase 4 — للتعديل أيضاً: إن كان رأسمالياً و toggle مفتوحاً، اعرض المودال.
      // ملاحظة: التعديل لا يُنشئ capital_asset تلقائياً (إن وُجد صف قديم،
      // addCapitalAsset يُرجِعه idempotent). لذلك آمن استدعاؤه دائماً.
      if (
        fields.isCapitalAsset &&
        advancedClassification &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        setPendingCapitalAsset({
          sourceType: "expense",
          sourceId: (res.data as { id: string }).id,
          name: fields.description || fields.category || "أصل رأسمالي",
          purchaseDate: fields.date ?? new Date().toLocaleDateString("en-CA"),
          purchaseAmountCents: fields.amountCents,
        });
      } else {
        updateUrl({ editExpense: null });
      }
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  // Phase 4 — تأكيد الإهلاك: استدعاء addCapitalAsset بعد حفظ الصف.
  const handleConfirmSpread = async (usefulLifeMonths: number) => {
    if (!pendingCapitalAsset) return;
    const res = await capitalAssetMutation.mutateAsync({
      sourceType: "expense",
      sourceId: pendingCapitalAsset.sourceId,
      name: pendingCapitalAsset.name,
      purchaseDate: pendingCapitalAsset.purchaseDate,
      purchaseAmountCents: pendingCapitalAsset.purchaseAmountCents,
      usefulLifeMonths,
    });
    if (res.status === "ok") {
      toast.success(
        `تم إنشاء الإهلاك — ${formatFilsToJod(
          res.data.monthlyDepreciationCents,
        )} شهرياً لمدة ${res.data.usefulLifeMonths} شهراً`,
      );
    } else {
      toast.error(res.message);
    }
    setPendingCapitalAsset(null);
    updateUrl({ newExpense: null, editExpense: null });
  };

  const handleConfirmDeductOnce = () => {
    // لا capital_asset يُنشأ — السلوك الافتراضي Phase 2 (إضافات رأسمالية).
    toast.info("تم تسجيل الأصل كإضافة رأسمالية — لا إهلاك شهري");
    setPendingCapitalAsset(null);
    updateUrl({ newExpense: null, editExpense: null });
  };

  const handleCloseDepreciationModal = () => {
    // المستخدم أغلق بدون اختيار — نعامله كـ«خصم مرة واحدة» (السلوك الافتراضي).
    setPendingCapitalAsset(null);
    updateUrl({ newExpense: null, editExpense: null });
  };

  const handleConfirmDelete = async () => {
    if (!editId) return;
    const updatedAt = activeExpense?.updatedAt instanceof Date
      ? activeExpense.updatedAt.toISOString()
      : String(activeExpense?.updatedAt || "");
    const res = await deleteMutation.mutateAsync({ id: editId, updatedAt });
    if (res.status === "ok") {
      toast.success("تم حذف المصروف بنجاح");
      updateUrl({ editExpense: null });
      setDeleteConfirmOpen(false);
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  // D7 fix — تأكيد إيقاف الإهلاك: استدعاء deleteCapitalAsset للمعرّف المُخزَّن.
  // الفشل 3 من review D7: كانت deleteCapitalAsset بلا مستدعٍ. الآن لها زر واضح.
  const handleConfirmStopDepreciation = async () => {
    if (!stopDepreciationAssetId) return;
    const res = await deleteCapitalAssetMutation.mutateAsync(stopDepreciationAssetId);
    if (res.status === "ok") {
      toast.success("تم إيقاف الإهلاك. لن يُخصَم من الربح التشغيلي مستقبلاً.");
      setStopDepreciationAssetId(null);
      refetch();
    } else {
      toast.error(res.message ?? "تعذّر إيقاف الإهلاك");
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col pb-36">

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          title={search || category !== "all" || natureFilter ? "لا توجد نتائج بحث مطابقة" : "لا توجد مصاريف مسجلة"}
          description={
            search || category !== "all" || natureFilter
              ? "جرب تعديل كلمة البحث أو فلتر الفئات أو فلتر الطبيعة."
              : "تسجيل المصاريف التشغيلية (الرواتب، الإيجارات، الفواتير) يعطي رؤية دقيقة للأرباح الصافية للورشة."
          }
          actionLabel={search || category !== "all" || natureFilter ? undefined : "تسجيل مصروف"}
          onAction={
            search || category !== "all" || natureFilter ? undefined : () => updateUrl({ newExpense: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          {/* SA3 (Round 4 — B-5): مفتاح الشارات (legend) مع InfoTooltip واحد يشرح
              الفرق بين الأنواع الثلاثة. بدل تكرار الـ tooltip على كل صف. */}
          <div className="flex items-center gap-2 text-[10px] text-ink/50 flex-wrap px-1">
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-warn-soft text-warn-deep rounded-full font-bold">رأس مال</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-info-soft text-info rounded-full font-bold">ثابتة</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="px-1.5 py-0.5 bg-canvas text-ink-3 rounded-full font-bold">متغيّرة</span>
            </span>
            <InfoTooltip text="«رأس مال»: آلة أو أثاث يخدم المشروع لسنوات — لا يُخصم من الربح التشغيلي في الشهر، بل يُهلَّك عبر الزمن (إن فعّلت الإهلاك). «ثابتة»: مصروف شهري ثابت تقريباً (إيجار، راتب). «متغيّرة»: مصروف يرتفع وينخفض مع حجم العمل (خامات، تغليف، وقود)." />
          </div>
          <div className="space-y-3">
            {filteredExpenses.map((item, idx) => {
              // SA-B (R5-3) — صفوف هدر/تلف المخزون مُشتقّة تلقائياً من
              // adjustStock؛ لا يجوز تعديلها أو حذفها من هنا (يكسر IC-1).
              // اجعل الصف للقراءة فقط: لا role=button، لا onClick، لا hover،
              // وأضف شارة «تلقائي» ليُدرِك المالك سبب غياب أزرار التعديل.
              const isWriteoff = item.isInventoryWriteoff === true;
              return (
            // biome-ignore lint/a11y/useSemanticElements: card container is interactive
            <div
              key={item.id}
              role={isWriteoff ? undefined : "button"}
              tabIndex={isWriteoff ? -1 : 0}
              onClick={
                isWriteoff
                  ? undefined
                  : () => updateUrl({ editExpense: item.id })
              }
              onKeyDown={
                isWriteoff
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        updateUrl({ editExpense: item.id });
                      }
                    }
              }
              style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
              className={`p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 transition-colors animate-fade-slide-in ${
                isWriteoff
                  ? "cursor-default"
                  : "hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink text-base">
                  {item.description || "مصروف عام"}
                </span>
                <span className="font-bold text-ink text-base">
                  <AmountText amount={item.amountCents} />
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-ink/60 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="px-2.5 py-1 bg-canvas rounded-full text-ink/80 text-[10px] font-bold">
                    {item.category}
                  </span>
                  {/* Phase 2 — شارة التصنيف: رأس مال (warn) / ثابتة (info) / متغيّرة (canvas).
                      SA3: استبدال ألوان Tailwind الخام (amber-100/blue-100) برموز النظام
                      (warn-soft/warn-deep، info-soft/info) لمطابقة SA2 baseline §1.2. */}
                  {item.isCapitalAsset ? (
                    <span className="px-2 py-0.5 bg-warn-soft text-warn-deep text-[10px] rounded-full font-bold">رأس مال</span>
                  ) : item.costNature === "fixed" ? (
                    <span className="px-2 py-0.5 bg-info-soft text-info text-[10px] rounded-full font-bold">ثابتة</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-canvas text-ink-3 text-[10px] rounded-full font-bold">متغيّرة</span>
                  )}
                  {/* SA-B (R5-3) — شارة «تلقائي» على صفوف هدر/تلف المخزون
                      المُشتقّة من adjustStock. تُنبِّه المالك أن الصف لا يُحرَّر
                      من هنا وأن أي تصحيح يجب أن يتم من شاشة الكتالوج. */}
                  {isWriteoff && (
                    <span
                      className="px-2 py-0.5 bg-emerald-soft text-emerald-deep text-[10px] rounded-full font-bold"
                      title="مصروف ناتج تلقائياً عن تسوية مخزون — لا يُحرَّر من هنا"
                    >
                      تلقائي
                    </span>
                  )}
                  {/* D7 fix — زر «إيقاف الإهلاك» على الصفوف التي لها capital_asset نشط.
                      SA3: استبدال amber-* الخام برموز warn، وتكبير الهدف اللمسي (min-h + min-w)
                      لمطابقة SA2 baseline §3.6 (tap targets ≥ 44px).
                      SA3 (Round 4 — B-2): min-h-[28px] → min-h-[44px] لتحقيق معيار اللمس. */}
                  {item.activeCapitalAssetId && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStopDepreciationAssetId(item.activeCapitalAssetId!);
                      }}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center px-3 py-1 bg-warn-soft text-warn-deep text-[11px] rounded-full font-bold border border-warn/30 hover:bg-warn-soft/70 transition-colors"
                      title="إيقاف الإهلاك — لن يُخصَم من الربح التشغيلي مستقبلاً"
                    >
                      إيقاف الإهلاك
                    </button>
                  )}
                </div>
                <DateText date={item.date} relative />
              </div>
            </div>
              );
            })}
          </div>

          {hasNextPage && (
            <Button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              variant="secondary"
              className="w-full"
            >
              {isFetchingNextPage ? "جاري التحميل..." : "تحميل المزيد"}
            </Button>
          )}
        </div>
      )}

      {/* مودال إنشاء مصروف جديد */}
      <ResponsiveModal
        isOpen={newExpense}
        onClose={() => updateUrl({ newExpense: null })}
        title="تسجيل مصروف جديد"
      >
        <ExpenseForm
          categories={categoriesList.filter((c) => c !== "الكل")}
          onSubmit={handleCreate}
          isSubmitting={createMutation.isPending}
        />
      </ResponsiveModal>

      {/* مودال تعديل المصروف */}
      <ResponsiveModal
        isOpen={editId !== null && editId !== undefined}
        onClose={() => updateUrl({ editExpense: null })}
        title="تعديل بيانات المصروف"
      >
        {isLoadingActive ? (
          <div className="p-4 text-center text-sm text-ink-3">جاري التحميل...</div>
        ) : activeExpense?.isInventoryWriteoff ? (
          // SA-B (R5-3) — صف هدر/تلف المخزون لا يُحرَّر من هنا. عرض رسالة
          // تفسيرية بدل الفورم (لا أزرار تعديل/حذف). يحمي من فتح المودال عبر
          // URL مباشر (?editExpense=<id>) حتى لو تعذّر النقر على الصف.
          <div className="p-4 space-y-3 text-sm text-ink-2 leading-relaxed">
            <p className="font-bold text-ink">هذا مصروف تلقائي</p>
            <p>
              هذا المصروف ناتج تلقائياً عن تسوية مخزون يدوية ولا يمكن تعديله أو
              حذفه من هنا — صحِّح المخزون من شاشة الكتالوج.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => updateUrl({ editExpense: null })}
            >
              إغلاق
            </Button>
          </div>
        ) : (
          <ExpenseForm
            initialData={activeExpense}
            categories={categoriesList.filter((c) => c !== "الكل")}
            onSubmit={handleUpdate}
            onDelete={() => setDeleteConfirmOpen(true)}
            isSubmitting={updateMutation.isPending}
          />
        )}
      </ResponsiveModal>



      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد حذف المصروف"
        message="هل أنت متأكد من رغبتك في حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />

      {/* D7 fix — تأكيد إيقاف الإهلاك. النص يُوضِّح أن الإهلاك المتراكم سابقاً
          يبقى في الأرقام التاريخية، وأن الإيقاف يؤثر فقط على المستقبل. */}
      <ConfirmDialog
        isOpen={stopDepreciationAssetId !== null}
        title="تأكيد إيقاف الإهلاك"
        message="سيوقف هذا الإهلاك عن تخفيض الربح التشغيلي. الإهلاك المُتراكم حتى الآن سيبقى في الأرقام التاريخية. هل أنت متأكد؟"
        onConfirm={handleConfirmStopDepreciation}
        onCancel={() => setStopDepreciationAssetId(null)}
        isLoading={deleteCapitalAssetMutation.isPending}
      />

      {/* Phase 4 — مودال سؤال الإهلاك بعد حفظ صف رأسمالي (خلف toggle «تصنيف متقدّم»). */}
      <DepreciationPromptModal
        isOpen={pendingCapitalAsset !== null}
        onClose={handleCloseDepreciationModal}
        assetName={pendingCapitalAsset?.name ?? ""}
        purchaseAmountCents={pendingCapitalAsset?.purchaseAmountCents ?? 0}
        onConfirmDeductOnce={handleConfirmDeductOnce}
        onConfirmSpread={handleConfirmSpread}
        isSubmitting={capitalAssetMutation.isPending}
      />
    </div>
  );
}
