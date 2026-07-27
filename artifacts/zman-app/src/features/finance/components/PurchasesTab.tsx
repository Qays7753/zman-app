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

export function PurchasesTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const newPurchase = searchParams.get("newPurchase") === "true";
  const editId = searchParams.get("editPurchase");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // D7 fix — إيقاف الإهلاك لصف capital_asset نشط.
  const [stopDepreciationAssetId, setStopDepreciationAssetId] = useState<string | null>(null);
  // Phase 4 — معلومات الصف الرأسمالي المُنشَأ مؤخراً + إظهار مودال الإهلاك.
  const [pendingCapitalAsset, setPendingCapitalAsset] =
    useState<PendingCapitalAsset | null>(null);
  const capitalAssetMutation = useAddCapitalAsset();
  const deleteCapitalAssetMutation = useDeleteCapitalAsset();

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

  // Phase 2 — فلتر URL اختياري `?nature=capital|fixed|variable` (يُطبَّق على العميل).
  const natureFilter = searchParams.get("nature");
  const filteredPurchases = natureFilter
    ? purchases.filter((item) => {
        if (natureFilter === "capital") return item.isCapitalAsset === true;
        if (natureFilter === "fixed") return item.isCapitalAsset === false && item.costNature === "fixed";
        if (natureFilter === "variable")
          return item.isCapitalAsset === false && (item.costNature === "variable" || !item.costNature);
        return true;
      })
    : purchases;

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
    fields: NewPurchase,
    advancedClassification: boolean,
  ) => {
    const res = await createMutation.mutateAsync({
      values: fields,
      requestId: crypto.randomUUID(),
    });
    if (res.status === "ok") {
      toast.success("تم تسجيل المشتريات بنجاح");
      // Phase 4 — إن كان رأسمالياً والـ toggle «تصنيف متقدّم» مفتوحاً، اعرض
      // مودال الإهلاك. وإلا فالسلوك الافتراضي Phase 2.
      if (
        fields.isCapitalAsset &&
        advancedClassification &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        // totalCents = round(unitCostMicroCents × quantity / 1000). يُحسَب هنا
        // لأن purchaseInputSchema لا يضمّ totalCents (الـ DB يُولِّده GENERATED ALWAYS).
        const micro = fields.unitCostMicroCents ?? 0;
        const qty = fields.quantity ?? 1;
        const totalCents = Math.round((micro * qty) / 1000);
        setPendingCapitalAsset({
          sourceType: "purchase",
          sourceId: (res.data as { id: string }).id,
          name: fields.item ?? "أصل رأسمالي",
          purchaseDate: fields.date ?? new Date().toLocaleDateString("en-CA"),
          purchaseAmountCents: totalCents,
        });
      } else {
        updateUrl({ newPurchase: null });
      }
      refetch();
    } else {
      toast.error(res.message);
    }
  };

  const handleUpdate = async (
    fields: NewPurchase,
    advancedClassification: boolean,
  ) => {
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
      if (
        fields.isCapitalAsset &&
        advancedClassification &&
        res.data &&
        typeof res.data === "object" &&
        "id" in res.data
      ) {
        const micro = fields.unitCostMicroCents ?? 0;
        const qty = fields.quantity ?? 1;
        const totalCents = Math.round((micro * qty) / 1000);
        setPendingCapitalAsset({
          sourceType: "purchase",
          sourceId: (res.data as { id: string }).id,
          name: fields.item ?? "أصل رأسمالي",
          purchaseDate: fields.date ?? new Date().toLocaleDateString("en-CA"),
          purchaseAmountCents: totalCents,
        });
      } else {
        updateUrl({ editPurchase: null });
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
      sourceType: "purchase",
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
    updateUrl({ newPurchase: null, editPurchase: null });
  };

  const handleConfirmDeductOnce = () => {
    toast.info("تم تسجيل الأصل كإضافة رأسمالية — لا إهلاك شهري");
    setPendingCapitalAsset(null);
    updateUrl({ newPurchase: null, editPurchase: null });
  };

  const handleCloseDepreciationModal = () => {
    setPendingCapitalAsset(null);
    updateUrl({ newPurchase: null, editPurchase: null });
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
    <div className="space-y-4 flex-1 flex flex-col pb-24">

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          title={search || natureFilter ? "لا توجد نتائج بحث مطابقة" : "لا توجد مشتريات مسجلة"}
          description={
            search || natureFilter
              ? "جرب تعديل كلمة البحث أو فلتر النتائج."
              : "تسجيل المشتريات يساعد في حصر تكلفة المواد الخام وحساب صافي أرباح الورشة بدقة."
          }
          actionLabel={search || natureFilter ? undefined : "تسجيل أول فاتورة"}
          onAction={
            search || natureFilter ? undefined : () => updateUrl({ newPurchase: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          <div className="space-y-3">
            {filteredPurchases.map((item, idx) => (
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
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-ink text-base truncate">
                      {item.item}
                    </span>
                    {/* Phase 2 — شارة التصنيف: رأس مال (amber) / ثابتة (blue) / متغيّرة (canvas). */}
                    {item.isCapitalAsset ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full font-bold shrink-0">رأس مال</span>
                    ) : item.costNature === "fixed" ? (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] rounded-full font-bold shrink-0">ثابتة</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-canvas text-ink-3 text-[10px] rounded-full font-bold shrink-0">متغيّرة</span>
                    )}
                    {/* D7 fix — زر «إيقاف الإهلاك» على الصفوف التي لها capital_asset نشط. */}
                    {item.activeCapitalAssetId && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStopDepreciationAssetId(item.activeCapitalAssetId!);
                        }}
                        className="px-2 py-0.5 bg-amber-50 text-amber-900 text-[10px] rounded-full font-bold border border-amber-300 hover:bg-amber-100 transition-colors shrink-0"
                        title="إيقاف الإهلاك — لن يُخصَم من الربح التشغيلي مستقبلاً"
                      >
                        إيقاف الإهلاك
                      </button>
                    )}
                  </div>
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

      {/* D7 fix — تأكيد إيقاف الإهلاك. */}
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
