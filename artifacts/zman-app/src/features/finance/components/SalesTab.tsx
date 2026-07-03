"use client";

import { Landmark, Plus, Search, ShoppingBag } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/shared/Button";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FilterChip } from "@/components/shared/FilterChip";
import { ListHeader } from "@/components/shared/ListHeader";
import {
  useCreateSale,
  useDeleteSale,
  useInfiniteSales,
  useSale,
  useUpdateSale,
} from "../hooks";
import type { NewSale } from "../types";
import { SaleForm } from "./SaleForm";

export function SalesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const source = searchParams.get("source") || "all";
  const newSale = searchParams.get("newSale") === "true";
  const editId = searchParams.get("editSale");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // الفلاتر المتاحة للمصدر
  const sourceFilters = [
    { label: "الكل", value: "all" },
    { label: "مباشر", value: "direct" },
    { label: "طلب محول", value: "order" },
  ];

  // هوك جلب البيانات اللانهائي
  const querySource = source === "direct" ? "manual" : source === "order" ? "order" : undefined;
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteSales({ search, source: querySource });

  const activeSale = useSale(editId || "").data;
  const isLoadingActive = useSale(editId || "").isLoading;

  const createMutation = useCreateSale();
  const updateMutation = useUpdateSale();
  const deleteMutation = useDeleteSale();

  const sales = data?.pages.flatMap((page) => page.items) || [];

  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };

  const handleSearchChange = (val: string) => {
    startTransition(() => {
      updateUrl({ search: val || null });
    });
  };

  const handleSourceFilter = (src: string) => {
    startTransition(() => {
      updateUrl({ source: src === "all" ? null : src });
    });
  };

  const handleCreate = async (fields: NewSale) => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المبيعات بنجاح");
      updateUrl({ newSale: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (fields: NewSale) => {
    if (!editId || !activeSale) return;
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt: activeSale.updatedAt.toISOString(),
      values: fields,
    });
    if (res.status === "ok") {
      toast.success("تم تحديث المبيعات بنجاح");
      updateUrl({ editSale: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!editId || !activeSale) return;
    setDeleteConfirmOpen(false);

    const res = await deleteMutation.mutateAsync({
      id: editId,
      updatedAt: activeSale.updatedAt.toISOString(),
    });
    if (res.status === "ok") {
      toast.success("تم حذف المبيعات بنجاح");
      updateUrl({ editSale: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      <ListHeader
        searchValue={search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="البحث في بيان المبيعات..."
        actions={
          <Button
            onClick={() => updateUrl({ newSale: "true" })}
            icon={<Plus className="h-4.5 w-4.5" />}
          >
            مبيعات
          </Button>
        }
        filters={
          <>
            {sourceFilters.map((filt) => (
              <FilterChip
                key={filt.value}
                label={filt.label}
                isActive={source === filt.value}
                onClick={() => handleSourceFilter(filt.value)}
              />
            ))}
          </>
        }
      />

      {/* قائمة المبيعات */}
      {isLoading ? (
        <SkeletonList count={3} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : sales.length === 0 ? (
        <EmptyState
          title={
            search || source !== "all"
              ? "لا توجد نتائج بحث مطابقة"
              : "لا توجد عمليات بيع مسجلة"
          }
          description={
            search || source !== "all"
              ? "جرب تعديل كلمة البحث أو فلتر المصدر."
              : "تسجيل المبيعات المباشرة أو تحويل الطلبات المنتهية إلى مبيعات يثبت إيراداتك."
          }
          actionLabel={search || source !== "all" ? undefined : "تسجيل مبيعات"}
          onAction={
            search || source !== "all"
              ? undefined
              : () => updateUrl({ newSale: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-3">
            {sales.map((item) => (
              // biome-ignore lint/a11y/useSemanticElements: card container is interactive
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => updateUrl({ editSale: item.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    updateUrl({ editSale: item.id });
                  }
                }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-base">
                    {item.description || "عملية بيع"}
                  </span>
                  <span className="font-bold text-ink text-md">
                    <AmountText amount={item.amountCents} />
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-ink/60">
                  <span className="flex items-center gap-1">
                    {item.source === "order" ? (
                      <>
                        <ShoppingBag className="h-3.5 w-3.5 text-info" />
                        <span className="text-info font-bold">عن طريق طلب</span>
                      </>
                    ) : (
                      <>
                        <Landmark className="h-3.5 w-3.5 text-ink/60" />
                        <span>يدوي مباشر</span>
                      </>
                    )}
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

      {/* ورقة إدخال مبيعات جديدة */}
      <ResponsiveModal
        isOpen={newSale}
        onClose={() => updateUrl({ newSale: null })}
        title="تسجيل إيراد مبيعات مباشر"
      >
        <SaleForm
          onSubmit={handleCreate}
          isSubmitting={createMutation.isPending}
        />
      </ResponsiveModal>

      {/* ورقة تعديل مبيعات قائمة */}
      <ResponsiveModal
        isOpen={!!editId}
        onClose={() => updateUrl({ editSale: null })}
        title="تعديل تفاصيل المبيعات"
      >
        {isLoadingActive ? (
          <SkeletonList count={3} />
        ) : (
          <SaleForm
            initialData={activeSale}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
            isSubmitting={updateMutation.isPending || deleteMutation.isPending}
          />
        )}
      </ResponsiveModal>
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف عملية البيع هذه؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
