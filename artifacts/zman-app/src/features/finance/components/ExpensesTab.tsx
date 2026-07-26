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

import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useInfiniteExpenses,
  useUpdateExpense,
} from "../hooks";
import type { NewExpense } from "../types";
import { ExpenseForm } from "./ExpenseForm";
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



  const handleCreate = async (fields: NewExpense) => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المصروف بنجاح");
      updateUrl({ newExpense: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (fields: NewExpense) => {
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
      updateUrl({ editExpense: null });
      refetch();
    } else {
      toast.error(res.message);
    }
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

  return (
    <div className="space-y-4 flex-1 flex flex-col pb-24">

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
          <div className="space-y-3">
            {filteredExpenses.map((item, idx) => (
              // biome-ignore lint/a11y/useSemanticElements: card container is interactive
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => updateUrl({ editExpense: item.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    updateUrl({ editExpense: item.id });
                  }
                }}
                style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer transition-colors animate-fade-slide-in"
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
                    {/* Phase 2 — شارة التصنيف: رأس مال (amber) / ثابتة (blue) / متغيّرة (canvas). */}
                    {item.isCapitalAsset ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full font-bold">رأس مال</span>
                    ) : item.costNature === "fixed" ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full font-bold">ثابتة</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-canvas text-ink-3 text-[10px] rounded-full font-bold">متغيّرة</span>
                    )}
                  </div>
                  <DateText date={item.date} relative />
                </div>
              </div>
            ))}
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
    </div>
  );
}
