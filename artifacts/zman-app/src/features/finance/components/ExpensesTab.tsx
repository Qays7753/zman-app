"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Boxes, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/shared/Button";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { CardActionSheet } from "@/components/shared/CardActionSheet";
import { scheduleDeleteWithUndo } from "@/lib/undo-delete";

import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useInfiniteExpenses,
} from "../hooks";
import type { NewExpense } from "../types";
import { SmartFinanceForm } from "./SmartFinanceForm";
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
  // Issue #12 — قائمة معرّفات الصفوف المُخفاة مؤقتاً انتظاراً للحذف النهائي بعد
  // انتهاء مهلة الـ 5 ثوانٍ للتنبيه. إن ضغط المستخدم «تراجع» يُحذف المعرّف من
  // هذه المجموعة فيُعاد الصف للظهور.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // D7 fix — إيقاف الإهلاك لصف capital_asset نشط. نُخزِّن المعرّف فقط ونفتح
  // ConfirmDialog للتأكيد قبل استدعاء deleteCapitalAsset.
  const [stopDepreciationAssetId, setStopDepreciationAssetId] = useState<string | null>(null);
  // Issue #15 — شيت إجراءات سفلي لكل صف مصروف (تعديل/حذف) بدلاً من نقْر البطاقة
  // بأكملها. الصفوف ذات isInventoryWriteoff=true للقراءة فقط ولا تحصل على زر ⋯.
  const [actionSheetItem, setActionSheetItem] = useState<(typeof visibleExpenses)[number] | null>(null);
  // Phase 4 — معلومات الصف الرأسمالي المُنشَأ مؤخراً + إظهار مودال الإهلاك.
  const [pendingCapitalAsset, setPendingCapitalAsset] =
    useState<PendingCapitalAsset | null>(null);
  const capitalAssetMutation = useAddCapitalAsset();
  const deleteCapitalAssetMutation = useDeleteCapitalAsset();

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
  // Task B (Round 5) — بدلاً من إخفاء الصفوف المُجدوَلة للحذف تماماً (مما يُفقد
  // المستخدم الإحساس بأن شيئاً يحدث)، نُبقيها ظاهرة بمظهر «قيد الحذف»: شفافية
  // منخفضة، مؤشّر لمس معطّل، وسبنر دوّار مكان زر ⋯. زر «تراجع» يعيش في تنبيه
  // sonner خارج شجرة الصف، فلا يتأثّر بـ pointer-events-none على الصف.
  const visibleExpenses = filteredExpenses;

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

  // Issue #12 + #15 — حذف مع تراجع: يُخفي الصف فوراً (optimistic)، يُظهر تنبيه
  // sonner بزر «تراجع» لمدة 5 ثوانٍ، ثم يُنفِّذ الحذف الفعلي عبر useDeleteExpense.
  // إن ضغط المستخدم «تراجع» يُعاد الصف للظهور. إن فشل الحذف (مثل تعارض updatedAt)
  // يُعاد الصف ويُظهر تنبيه خطأ. لا يؤثر على صفوف هدر المخزون (isInventoryWriteoff)
  // لأنها محروسة في الواجهة بدون زر حذف.
  //
  // Issue #15 — حُوِّلت الدالة لتقبل (id, updatedAt) صريحة بدل قراءة editId من
  // URL. هذا يسمح استدعاءها من شيت الإجراءات السفلي (للصف المُختار) ومن زرّ
  // الحذف داخل مودال التعديل (للصف المفتوح). كلا المسارين تُغلق الواجهة المعروضة
  // فوراً قبل بدء العدّ التنازلي.
  const handleDeleteWithUndo = (idToDelete: string, updatedAtRaw: Date | string) => {
    const updatedAt =
      updatedAtRaw instanceof Date ? updatedAtRaw.toISOString() : String(updatedAtRaw || "");
    // أغلق مودال التعديل (إن كان مفتوحاً) ليُغادر المستخدم شاشة التحرير بينما
    // التنبيه ظاهر. إن لم يكن مفتوحاً فهذه لا-عملية.
    updateUrl({ editExpense: null });
    // أخفِ الصف من القائمة مباشرةً (تحديث متفائل).
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(idToDelete);
      return next;
    });
    scheduleDeleteWithUndo({
      message: "سيُحذف المصروف — لا تغلق الصفحة",
      onCommit: async () => {
        const res = await deleteMutation.mutateAsync({ id: idToDelete, updatedAt });
        if (res.status !== "ok") {
          // شامل حالة «عدّلته جهة أخرى» وأي خطأ آخر — ارمه ليلتقطه onError.
          throw new Error(res.message ?? "فشل الحذف");
        }
      },
      onUndo: () => {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(idToDelete);
          return next;
        });
      },
      onError: (e) => {
        // استعد الصف ثم اعرض رسالة الخطأ (مثل تعارض updatedAt).
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(idToDelete);
          return next;
        });
        const msg = e instanceof Error ? e.message : "فشل الحذف";
        toast.error(msg);
        refetch();
      },
    });
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
      {/* Issue #7 — زر «إدارة الفئات» في رأس تبويب المصاريف بدلاً من قائمة «المزيد».
          يفتح FinanceCatalogModal عبر محدد URL (manageCatalog=expenses) الذي يقرؤه
          FinanceClient.tsx ويُعرض المودال تلقائياً. */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => updateUrl({ manageCatalog: "expenses" })}
          icon={<Boxes className="w-4 h-4" />}
          className="text-xs"
        >
          إدارة الفئات
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : visibleExpenses.length === 0 ? (
        <EmptyState
          title={search || category !== "all" || natureFilter ? "لا توجد نتائج بحث مطابقة" : "لا توجد مصاريف مسجلة حتى الآن"}
          description={
            search || category !== "all" || natureFilter
              ? "جرب تعديل كلمة البحث أو فلتر الفئات أو فلتر الطبيعة."
              : "تسجيل المصاريف التشغيلية يضمن احتساب صافي أرباح الورشة بدقة."
          }
          steps={
            search || category !== "all" || natureFilter
              ? undefined
              : [
                  "اضغط زر (+) العائم أسفل الشاشة",
                  "اختر (مصروف جديد) وأدخل البيانات والمبلغ",
                  "اضغط حفظ لتحديث صافي أرباح الورشة فوراً"
                ]
          }
          actionLabel={search || category !== "all" || natureFilter ? undefined : "إضافة مصروف جديد (+)"}
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
            {visibleExpenses.map((item, idx) => {
              // SA-B (R5-3) — صفوف هدر/تلف المخزون مُشتقّة تلقائياً من
              // adjustStock؛ لا يجوز تعديلها أو حذفها من هنا (يكسر IC-1).
              // اجعل الصف للقراءة فقط: لا role=button، لا onClick، لا hover،
              // وأضف شارة «تلقائي» ليُدرِك المالك سبب غياب أزرار التعديل.
              const isWriteoff = item.isInventoryWriteoff === true;
              return (
            <div
              key={item.id}
              style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
              className={`p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 transition-colors animate-fade-slide-in ${
                isWriteoff ? "cursor-default" : "hover:border-ink/20"
              } ${hiddenIds.has(item.id) ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink text-base flex-1 min-w-0 truncate">
                  {item.description || "مصروف عام"}
                </span>
                <span className="font-bold text-ink text-base flex-shrink-0">
                  <AmountText amount={item.amountCents} />
                </span>
                {/* Task B (Round 5) — أثناء مهلة التراجع (5 ثوانٍ) أعرض سبنراً دوّاراً
                    بدل زر ⋯ لمطابقة نمط «isLoading» في زر الإرسال بالفورم.
                    Issue #15 — صفوف هدر المخزون للقراءة فقط فلا تحصل على زر ⋯ أصلاً. */}
                {hiddenIds.has(item.id) ? (
                  <Loader2 className="w-5 h-5 animate-spin text-ink-3 flex-shrink-0" />
                ) : !isWriteoff ? (
                  <button
                    type="button"
                    onClick={() => setActionSheetItem(item)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-canvas transition-colors flex-shrink-0"
                    aria-label="إجراءات"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                ) : null}
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

      {/* مودال إنشاء جديد — SmartFinanceForm يغطي: مصروف يومي / شراء مواد / أصل */}
      <ResponsiveModal
        isOpen={newExpense}
        onClose={() => updateUrl({ newExpense: null })}
        title="تسجيل جديد"
      >
        <SmartFinanceForm
          onSuccess={() => refetch()}
          onClose={() => updateUrl({ newExpense: null })}
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
          // Issue #1 — Edit Trap: نستخدم SmartFinanceForm للتعديل بدلاً من ExpenseForm.
          // النموذج يُحدِّث السجل عبر useUpdateExpense داخلياً. زر الحذف يُعرَض
          // منفصلاً أسفل النموذج لأن SmartFinanceForm لا يُدير الحذف (يبقى من
          // مسؤولية الأب عبر ConfirmDialog القائم).
          <div className="space-y-3">
            <SmartFinanceForm
              initialData={
                activeExpense
                  ? {
                      id: activeExpense.id,
                      updatedAt: activeExpense.updatedAt,
                      type: activeExpense.isCapitalAsset ? "asset" : "expense",
                      date: new Date(activeExpense.date).toLocaleDateString("en-CA"),
                      amountCents: activeExpense.amountCents,
                      description: activeExpense.description ?? "",
                      category: activeExpense.category,
                      isCapitalAsset: activeExpense.isCapitalAsset ?? false,
                      costNature:
                        (activeExpense.costNature as "variable" | "fixed" | null) ?? null,
                    }
                  : undefined
              }
              onSuccess={() => refetch()}
              onClose={() => updateUrl({ editExpense: null })}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!activeExpense) return;
                handleDeleteWithUndo(activeExpense.id, activeExpense.updatedAt);
              }}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              حذف المصروف
            </Button>
          </div>
        )}
      </ResponsiveModal>



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

      {/* Issue #15 — شيت إجراءات سفلي لكل صف مصروف. المساران:
          - «تعديل» → فتح مودال التعديل عبر URL (?editExpense=<id>).
          - «حذف» → handleDeleteWithUndo(id, updatedAt) الذي يُسلك scheduleDeleteWithUndo
            (نمط الحذف بتراجع 5 ثوانٍ من commit 8b69d87). لا ConfirmDialog هنا. */}
      <CardActionSheet
        isOpen={actionSheetItem !== null}
        onClose={() => setActionSheetItem(null)}
        title="إجراءات"
        actions={
          actionSheetItem
            ? [
                {
                  label: "تعديل",
                  icon: <Pencil className="w-5 h-5" />,
                  onClick: () => {
                    const id = actionSheetItem.id;
                    setActionSheetItem(null);
                    updateUrl({ editExpense: id });
                  },
                },
                {
                  label: "حذف",
                  icon: <Trash2 className="w-5 h-5" />,
                  variant: "danger" as const,
                  onClick: () => {
                    const item = actionSheetItem;
                    setActionSheetItem(null);
                    handleDeleteWithUndo(item.id, item.updatedAt);
                  },
                },
              ]
            : []
        }
      />
    </div>
  );
}
