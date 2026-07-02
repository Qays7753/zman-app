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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ListHeader } from "@/components/shared/ListHeader";
import { Button } from "@/components/shared/Button";
import {
  useCreatePurchase,
  useDeletePurchase,
  useInfinitePurchases,
  usePurchase,
  useUpdatePurchase,
} from "../hooks";
import type { NewPurchase } from "../types";
import { PurchaseForm } from "./PurchaseForm";
import { FinanceCatalogModal } from "./FinanceCatalogModal";

export function PurchasesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const newPurchase = searchParams.get("newPurchase") === "true";
  const editId = searchParams.get("editPurchase");
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // هوك جلب البيانات اللانهائي (§10.1)
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfinitePurchases({ search });

  const activePurchase = usePurchase(editId || "").data;
  const isLoadingActive = usePurchase(editId || "").isLoading;

  const createMutation = useCreatePurchase();
  const updateMutation = useUpdatePurchase();
  const deleteMutation = useDeletePurchase();

  const purchases = data?.pages.flatMap((page) => page.items) || [];

  // تحديث محددات الـ URL
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

  const handleCreate = async (fields: NewPurchase) => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المشتريات بنجاح");
      updateUrl({ newPurchase: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (fields: NewPurchase) => {
    if (!editId || !activePurchase) return;
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt: activePurchase.updatedAt.toISOString(),
      values: fields,
    });
    if (res.status === "ok") {
      toast.success("تم تحديث المشتريات بنجاح");
      updateUrl({ editPurchase: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!editId || !activePurchase) return;
    setDeleteConfirmOpen(false);

    const res = await deleteMutation.mutateAsync({
      id: editId,
      updatedAt: activePurchase.updatedAt.toISOString(),
    });
    if (res.status === "ok") {
      toast.success("تم حذف المشتريات بنجاح");
      updateUrl({ editPurchase: null });
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
        searchPlaceholder="البحث في المشتريات والموردين..."
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsCatalogOpen(true)}
              className="h-12 w-12 border border-hairline hover:bg-canvas text-ink-2 rounded-lg flex items-center justify-center transition-colors shrink-0"
              title="إدارة أصناف المشتريات"
            >
              <Boxes className="h-5 w-5" />
            </button>
            <Button
              onClick={() => updateUrl({ newPurchase: "true" })}
              icon={<Plus className="h-4.5 w-4.5" />}
            >
              مشتريات
            </Button>
          </>
        }
      />

      {/* قائمة المشتريات */}
      {isLoading ? (
        <SkeletonList count={3} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : purchases.length === 0 ? (
        <EmptyState
          title={search ? "لا توجد نتائج بحث مطابقة" : "لا توجد مشتريات مسجلة"}
          description={
            search
              ? "تأكد من كتابة الكلمات بشكل صحيح."
              : "ابدأ بتسجيل فواتير ومشتريات المواد الخام للمشروع."
          }
          actionLabel={search ? undefined : "تسجيل أول فاتورة"}
          onAction={
            search ? undefined : () => updateUrl({ newPurchase: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-3">
            {purchases.map((item) => (
              // biome-ignore lint/a11y/useSemanticElements: card container is interactive
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => updateUrl({ editPurchase: item.id })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    updateUrl({ editPurchase: item.id });
                  }
                }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-base">
                    {item.item}
                  </span>
                  <span className="font-bold text-ink text-md">
                    <AmountText amount={item.totalCents} />
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-ink/60">
                  <span>المورد: {item.supplier || "غير محدد"}</span>
                  <div className="flex items-center gap-1">
                    <span>{item.quantity} وحدات × </span>
                    <AmountText amount={item.unitCostCents} />
                  </div>
                </div>
                <div className="text-xs text-ink/40 border-t border-hairline/50 pt-2 flex justify-between">
                  <DateText date={item.date} />
                  {item.notes && (
                    <span className="truncate max-w-[200px]">{item.notes}</span>
                  )}
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

      {/* ورقة إدخال مشتريات جديدة */}
      <ResponsiveModal
        isOpen={newPurchase}
        onClose={() => updateUrl({ newPurchase: null })}
        title="تسجيل مشتريات جديدة"
      >
        <PurchaseForm
          onSubmit={handleCreate}
          isSubmitting={createMutation.isPending}
        />
      </ResponsiveModal>

      {/* ورقة تعديل مشتريات قائمة */}
      <ResponsiveModal
        isOpen={!!editId}
        onClose={() => updateUrl({ editPurchase: null })}
        title="تعديل تفاصيل المشتريات"
      >
        {isLoadingActive ? (
          <SkeletonList count={3} />
        ) : (
          <PurchaseForm
            initialData={activePurchase}
            onSubmit={handleUpdate}
            onDelete={handleDelete}
            isSubmitting={updateMutation.isPending || deleteMutation.isPending}
          />
        )}
      </ResponsiveModal>

      <FinanceCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        type="purchases"
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد الحذف"
        message="هل أنت متأكد من حذف هذه المشتريات؟"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
