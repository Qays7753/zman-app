"use client";

import { Boxes, Plus, Search } from "lucide-react";
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
import { FilterChip } from "@/components/shared/FilterChip";
import { ListHeader } from "@/components/shared/ListHeader";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpense,
  useInfiniteExpenses,
  useUpdateExpense,
} from "../hooks";
import type { NewExpense } from "../types";
import { ExpenseForm } from "./ExpenseForm";
import { FinanceCatalogModal } from "./FinanceCatalogModal";

export function ExpensesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "all";
  const newExpense = searchParams.get("newExpense") === "true";
  const editId = searchParams.get("editExpense");
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // الفئات المعتمدة للتصفية (§5.1)
  const categoriesList = [
    "الكل",
    "رواتب",
    "إيجار",
    "فواتير",
    "مواد خام",
    "تسويق",
    "صيانة",
    "أخرى",
  ];
  const formCategories = [
    "رواتب",
    "إيجار",
    "فواتير",
    "مواد خام",
    "تسويق",
    "صيانة",
    "أخرى",
  ];

  // هوك جلب البيانات اللانهائي
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteExpenses({
    search,
    category: category === "الكل" ? "all" : category,
  });

  const { data: activeExpense, isLoading: isLoadingActive } = useExpense(
    editId || "",
  );
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const expenses = data?.pages.flatMap((page) => page.items) || [];

  const updateUrl = (params: Record<string, string | null>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    }
    startTransition(() => {
      router.push(`${pathname}?${newParams.toString()}`);
    });
  };

  const handleSearchChange = (val: string) => {
    updateUrl({ search: val || null });
  };

  const handleCategoryFilter = (cat: string) => {
    updateUrl({ category: cat === "الكل" ? null : cat });
  };

  const handleCreate = async (values: NewExpense) => {
    const requestId = crypto.randomUUID();
    const res = await createMutation.mutateAsync({ values, requestId });
    if (res.status === "ok") {
      toast.success("تم تسجيل المصروف بنجاح");
      updateUrl({ newExpense: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (values: NewExpense) => {
    if (!editId || !activeExpense) return;
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt: activeExpense.updatedAt.toISOString(),
      values,
    });
    if (res.status === "ok") {
      toast.success("تم تحديث المصروف بنجاح");
      updateUrl({ editExpense: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!editId || !activeExpense) return;
    setDeleteConfirmOpen(false);

    const res = await deleteMutation.mutateAsync({
      id: editId,
      updatedAt: activeExpense.updatedAt.toISOString(),
    });
    if (res.status === "ok") {
      toast.success("تم حذف المصروف بنجاح");
      updateUrl({ editExpense: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {/* شريط البحث وزر الإضافة */}
      <ListHeader
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="البحث في تفاصيل المصاريف..."
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="h-12 w-12 border border-hairline hover:bg-canvas text-ink-2 rounded-lg flex items-center justify-center transition-colors shrink-0"
              title="إدارة فئات المصاريف"
            >
              <Boxes className="h-5 w-5" />
            </button>
            <Button
              onClick={() => updateUrl({ newExpense: "true" })}
              icon={<Plus className="h-4.5 w-4.5" />}
            >
              مصروف
            </Button>
          </>
        }
        filters={
          <>
            {categoriesList.map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                isActive={(cat === "الكل" && category === "all") || category === cat}
                onClick={() => handleCategoryFilter(cat)}
              />
            ))}
          </>
        }
      />

      {/* قائمة المصاريف */}
      {isLoading ? (
        <SkeletonList count={3} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : expenses.length === 0 ? (
        <EmptyState
          title={
            search || category !== "all"
              ? "لا توجد نتائج بحث مطابقة"
              : "لا توجد مصاريف مسجلة"
          }
          description={
            search || category !== "all"
              ? "جرب تعديل خيارات التصفية أو كلمة البحث."
              : "سجل مصاريف وتكاليف التشغيل الخاصة بالورشة للحصول على ميزان مالي صحيح."
          }
          actionLabel={search || category !== "all" ? undefined : "تسجيل مصروف"}
          onAction={
            search || category !== "all"
              ? undefined
              : () => updateUrl({ newExpense: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-3">
            {expenses.map((item) => (
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
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-base">
                    {item.description || "مصروف عام"}
                  </span>
                  <span className="font-bold text-ink text-md">
                    <AmountText amount={item.amountCents} />
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-ink/60">
                  <span className="px-2 py-0.5 bg-canvas rounded-full text-ink/80 text-[10px] font-bold">
                    {item.category}
                  </span>
                  <DateText date={item.date} />
                </div>
              </div>
            ))}
          </div>

          {/* زر تحميل المزيد */}
          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full h-11 border border-hairline text-sm font-bold text-ink/80 rounded-md hover:bg-canvas transition-colors"
            >
              {isFetchingNextPage ? "جاري التحميل..." : "تحميل المزيد"}
            </button>
          )}
        </div>
      )}

      {/* ورقة إدخال مصروف جديد */}
      <ResponsiveModal
        isOpen={newExpense}
        onClose={() => updateUrl({ newExpense: null })}
        title="تسجيل مصروف جديد"
      >
        <ExpenseForm
          onSubmit={handleCreate}
          categories={formCategories}
          isSubmitting={createMutation.isPending}
        />
      </ResponsiveModal>

      {/* ورقة تعديل مصروف قائم */}
      <ResponsiveModal
        isOpen={!!editId}
        onClose={() => updateUrl({ editExpense: null })}
        title="تعديل تفاصيل المصروف"
      >
        {isLoadingActive ? (
          <SkeletonList count={3} />
        ) : (
          <ExpenseForm
            initialData={activeExpense}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
            categories={formCategories}
            isSubmitting={updateMutation.isPending || deleteMutation.isPending}
          />
        )}
      </ResponsiveModal>

      <FinanceCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        type="expenses"
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذا المصروف؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
