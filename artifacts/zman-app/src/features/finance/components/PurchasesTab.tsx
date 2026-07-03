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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
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
    if (!editId) return;
    const updatedAt = activePurchase?.updatedAt instanceof Date
      ? activePurchase.updatedAt.toISOString()
      : String(activePurchase?.updatedAt || "");
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt,
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

  const handleConfirmDelete = async () => {
    if (!editId) return;
    const updatedAt = activePurchase?.updatedAt instanceof Date
      ? activePurchase.updatedAt.toISOString()
      : String(activePurchase?.updatedAt || "");
    const res = await deleteMutation.mutateAsync({ id: editId, updatedAt });
    if (res.status === "ok") {
      toast.success("تم حذف المشتريات بنجاح");
      updateUrl({ editPurchase: null });
      setDeleteConfirmOpen(false);
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : purchases.length === 0 ? (
        <EmptyState
          title={search ? "لا توجد نتائج بحث مطابقة" : "لا توجد مشتريات مسجلة"}
          description={
            search
              ? "جرب تعديل كلمة البحث أو فلتر النتائج."
              : "تسجيل المشتريات يساعد في حصر تكلفة المواد الخام وحساب صافي أرباح الورشة بدقة."
          }
          actionLabel={search ? undefined : "تسجيل أول فاتورة"}
          onAction={
            search ? undefined : () => updateUrl({ newPurchase: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-3">
            {purchases.map((item, idx) => (
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
                style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 cursor-pointer transition-all animate-fade-slide-in"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-base">
                    {item.item}
                  </span>
                  <span className="font-bold text-ink text-base">
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
                <div className="flex justify-between items-center pt-2 border-t border-hairline text-[10px] text-ink-3">
                  <DateText date={item.date} relative />
                  {item.notes && <span className="truncate max-w-[180px]">{item.notes}</span>}
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

      {/* مودال إنشاء مشتريات جديدة */}
      <ResponsiveModal
        isOpen={newPurchase}
        onClose={() => updateUrl({ newPurchase: null })}
        title="تسجيل مشتريات جديدة"
      >
        <PurchaseForm onSubmit={handleCreate} isSubmitting={createMutation.isPending} />
      </ResponsiveModal>

      {/* مودال تعديل المشتريات */}
      <ResponsiveModal
        isOpen={editId !== null && editId !== undefined}
        onClose={() => updateUrl({ editPurchase: null })}
        title="تعديل بيانات المشتريات"
      >
        {isLoadingActive ? (
          <div className="p-4 text-center text-sm text-ink-3">جاري التحميل...</div>
        ) : (
          <PurchaseForm
            initialData={activePurchase}
            onSubmit={handleUpdate}
            onDelete={() => setDeleteConfirmOpen(true)}
            isSubmitting={updateMutation.isPending}
          />
        )}
      </ResponsiveModal>



      {/* تأكيد الحذف */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد حذف المشتريات"
        message="هل أنت متأكد من رغبتك في حذف فاتورة الشراء هذه؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
