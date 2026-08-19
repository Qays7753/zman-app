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
import { cn } from "@/lib/utils";
import { Check, Filter } from "lucide-react";
import {
  useCreateSale,
  useDeleteSale,
  useInfiniteSales,
  useReverseSale,
  useSale,
  useUpdateSale,
} from "../hooks";
import type { NewSale } from "../types";
import { SaleForm } from "./SaleForm";

const SALE_SOURCE_CHIPS = [
  { id: "all", label: "الكل" },
  { id: "manual", label: "يدوي" },
  { id: "order", label: "طلب محوّل" },
] as const;

export function SalesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const source =
    (searchParams.get("source") as "all" | "manual" | "order") || "all";
  const newSale = searchParams.get("newSale") === "true";
  const editId = searchParams.get("editSale");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [isSourceFilterOpen, setIsSourceFilterOpen] = useState(false);

  // هوك جلب البيانات اللانهائي
  const querySource =
    source === "manual" || source === "order" ? source : undefined;
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
  const reverseMutation = useReverseSale();
  const isOrderSale =
    activeSale?.source === "order" || Boolean(activeSale?.orderId);

  const sales = data?.pages.flatMap((page) => page.items) || [];

  // تحديث محددات الـ URL
  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };

  const handleSourceChipChange = (newSourceId: "all" | "manual" | "order") => {
    const next = new URLSearchParams(searchParams.toString());
    if (newSourceId === "all") {
      next.delete("source");
    } else {
      next.set("source", newSourceId);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
    setIsSourceFilterOpen(false);
  };

  // يُرجِع نجاح الحفظ إلى SaleForm ليقرّر مسح المسودّة — لا تُمسح عند الرفض.
  const handleCreate = async (fields: NewSale): Promise<boolean> => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المبيعات بنجاح");
      updateUrl({ newSale: null });
      refetch();
      return true;
    }
    toast.error(res.message);
    return false;
  };

  const handleUpdate = async (fields: NewSale): Promise<boolean> => {
    if (!editId) return false;
    const updatedAt =
      activeSale?.updatedAt instanceof Date
        ? activeSale.updatedAt.toISOString()
        : String(activeSale?.updatedAt || "");
    const res = await updateMutation.mutateAsync({
      id: editId,
      updatedAt,
      values: fields,
    });
    if (res.status === "ok") {
      toast.success("تم تحديث بيانات المبيعات بنجاح");
      updateUrl({ editSale: null });
      refetch();
      return true;
    }
    toast.error(res.message);
    return false;
  };

  const handleConfirmDelete = async () => {
    if (!editId) return;
    if (activeSale?.source === "order" || activeSale?.orderId) {
      setDeleteConfirmOpen(false);
      toast.error("لا يمكن حذف مبيعة مرتبطة بطلب — استخدم عكس التسليم");
      return;
    }
    const updatedAt =
      activeSale?.updatedAt instanceof Date
        ? activeSale.updatedAt.toISOString()
        : String(activeSale?.updatedAt || "");
    const res = await deleteMutation.mutateAsync({ id: editId, updatedAt });
    if (res.status === "ok") {
      toast.success("تم حذف المبيعات بنجاح");
      updateUrl({ editSale: null });
      setDeleteConfirmOpen(false);
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleConfirmReverse = async () => {
    if (!activeSale?.orderId) return;
    const res = await reverseMutation.mutateAsync({
      orderId: activeSale.orderId,
    });
    if (res.status === "ok") {
      toast.success("تم عكس التسليم وإعادة الطلب إلى الحالة المؤكدة");
      setReverseConfirmOpen(false);
      updateUrl({ editSale: null });
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col fab-safe-area lg:pb-0">
      {/* فلتر موحّد لمصدر المبيعة — نفس لغة المدفوعات */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsSourceFilterOpen(true)}
          aria-expanded={isSourceFilterOpen}
          className={cn(
            "min-h-[44px] flex-1 flex items-center justify-between gap-2 rounded-lg border px-3 text-sm font-bold text-start transition-colors",
            source !== "all"
              ? "border-brand/30 bg-brand-soft/50 text-brand-deep"
              : "border-hairline bg-paper text-ink-2 hover:bg-canvas",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-brand" />
            <span className="truncate">
              {SALE_SOURCE_CHIPS.find((chip) => chip.id === source)?.label ??
                "الكل"}
            </span>
          </span>
          <span className="shrink-0 text-xs text-ink-3">تصفية المصدر</span>
        </button>

        {source !== "all" && (
          <button
            type="button"
            onClick={() => updateUrl({ source: null })}
            className="min-h-[44px] shrink-0 rounded-lg px-3 text-xs font-bold text-ink-2 hover:bg-canvas"
          >
            مسح
          </button>
        )}
      </div>

      <ResponsiveModal
        isOpen={isSourceFilterOpen}
        onClose={() => setIsSourceFilterOpen(false)}
        title="تصفية المبيعات"
      >
        <div className="space-y-3">
          <p className="text-xs font-bold text-ink-2">مصدر المبيعة</p>
          <div className="space-y-2">
            {SALE_SOURCE_CHIPS.map((chip) => {
              const isActive = source === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => handleSourceChipChange(chip.id)}
                  className={cn(
                    "min-h-[44px] w-full flex items-center justify-between gap-2 rounded-lg border px-3 text-sm font-bold text-start",
                    isActive
                      ? "border-brand bg-brand-soft text-brand-deep"
                      : "border-hairline bg-paper text-ink-2 hover:bg-canvas",
                  )}
                >
                  <span>{chip.label}</span>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0 text-brand" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </ResponsiveModal>

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : sales.length === 0 ? (
        <EmptyState
          title={
            search || source !== "all"
              ? "لا توجد نتائج بحث مطابقة"
              : "لا توجد عمليات بيع مسجلة حتى الآن"
          }
          description={
            search || source !== "all"
              ? "جرب تعديل كلمة البحث أو فلتر المصدر."
              : "تسجيل المبيعات المباشرة أو تسليم الطلبات يثبت الإيرادات النقدية للورشة."
          }
          steps={
            search || source !== "all"
              ? undefined
              : [
                  "اضغط زر (+) العائم أو تسليم طلب من شاشة الطلبات",
                  "أدخل تفاصيل البيع المباشر والمبلغ المالي",
                  "احفظ المبيعة لتُضاف تلقائياً لإيراداتك وميزانيتك",
                ]
          }
          actionLabel={
            search || source !== "all" ? undefined : "تسجيل مبيعة جديدة (+)"
          }
          onAction={
            search || source !== "all"
              ? undefined
              : () => updateUrl({ newSale: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          {/* شريط معلومات القائمة: عدّاد الحركات المعروضة */}
          <div className="px-1 text-xs text-ink/50 font-medium">
            <span>{sales.length} حركة معروضة</span>
          </div>
          <div className="space-y-3">
            {sales.map((item, idx) => (
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
                style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer transition-colors animate-fade-slide-in"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-base">
                    {item.description || "عملية بيع"}
                  </span>
                  <span
                    className="font-bold text-ink text-base"
                    title={
                      item.source === "order"
                        ? "إجمالي قيمة الطلب (شاملاً العربون والمتبقي)"
                        : "قيمة البيع المباشر"
                    }
                    aria-label={
                      item.source === "order"
                        ? "إجمالي قيمة الطلب شاملاً العربون والمتبقي"
                        : "قيمة البيع المباشر"
                    }
                  >
                    <AmountText amount={item.amountCents} />
                  </span>
                </div>
                {item.source === "order" &&
                  (item as any).depositCents !== undefined &&
                  (item as any).depositCents !== null && (
                    <div className="text-xs text-ink/50 border-t border-hairline/60 pt-1.5 mt-0.5 flex justify-between items-center font-medium">
                      <span>
                        منها عربون مُحصَّل سابقاً:{" "}
                        <span className="font-mono text-brand font-bold">
                          <AmountText amount={(item as any).depositCents} />
                        </span>
                      </span>
                      <span>
                        المتبقي المُرحَّل:{" "}
                        <span className="font-mono text-brand font-bold">
                          <AmountText
                            amount={
                              item.amountCents -
                              (Number((item as any).depositCents) || 0)
                            }
                          />
                        </span>
                      </span>
                    </div>
                  )}
                <div className="flex justify-between items-center text-xs text-ink/60">
                  <span className="flex items-center gap-1">
                    {item.source === "order" ? (
                      <span className="px-2 py-0.5 bg-brand-soft text-brand rounded text-[10px] font-bold">
                        طلب محوّل
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-canvas text-ink-2 rounded text-[10px] font-bold">
                        بيع مباشر
                      </span>
                    )}
                  </span>
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

      {/* مودال إنشاء مبيعات جديدة */}
      <ResponsiveModal
        isOpen={newSale}
        onClose={() => updateUrl({ newSale: null })}
        title="تسجيل مبيعات جديدة"
      >
        <SaleForm
          onSubmit={handleCreate}
          isSubmitting={createMutation.isPending}
        />
      </ResponsiveModal>

      {/* مودال تعديل المبيعات */}
      <ResponsiveModal
        isOpen={editId !== null && editId !== undefined}
        onClose={() => updateUrl({ editSale: null })}
        title="تعديل بيانات المبيعات"
      >
        {isLoadingActive ? (
          <div className="p-4 text-center text-sm text-ink-3">
            جاري التحميل...
          </div>
        ) : (
          <SaleForm
            initialData={activeSale}
            onSubmit={handleUpdate}
            onDelete={
              isOrderSale ? undefined : () => setDeleteConfirmOpen(true)
            }
            onReverse={
              isOrderSale ? () => setReverseConfirmOpen(true) : undefined
            }
            isSubmitting={updateMutation.isPending || reverseMutation.isPending}
          />
        )}
      </ResponsiveModal>

      {/* تأكيد الحذف للمبيعات اليدوية فقط */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="تأكيد حذف المبيعات"
        message="هل أنت متأكد من رغبتك في حذف عملية البيع هذه؟ لا يمكن التراجع عن هذا الإجراء."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={deleteMutation.isPending}
      />

      {/* عكس التسليم مسار مستقل عن حذف المبيعات ورد الأموال */}
      <ConfirmDialog
        isOpen={reverseConfirmOpen}
        title="تأكيد عكس التسليم"
        message="سيُعاد الطلب إلى الحالة المؤكدة، وتُستعاد كميات المخزون، وتُعكس حركة المبيعات المرتبطة. هذا لا ينفذ ردّاً للأموال."
        onConfirm={handleConfirmReverse}
        onCancel={() => setReverseConfirmOpen(false)}
        isLoading={reverseMutation.isPending}
      />
    </div>
  );
}
