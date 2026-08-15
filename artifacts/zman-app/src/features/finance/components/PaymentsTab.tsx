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
  useDeleteExpense,
  useDeletePurchase,
  useExpense,
  useInfinitePayments,
  usePurchase,
} from "../hooks";
import type { PaymentItem } from "../queries";
import { SmartFinanceForm } from "./SmartFinanceForm";
import { useDeleteCapitalAsset } from "@/features/depreciation/hooks";
import { cn } from "@/lib/utils";

const EXPENSE_CATEGORIES = [
  "الكل",
  "رواتب",
  "إيجار",
  "كهرباء ومياه",
  "نقل وتوصيل",
  "تعبئة وتغليف",
  "صيانة وأدوات",
  "أخرى",
] as const;

const FILTER_CHIPS = [
  { id: "all", label: "الكل" },
  { id: "expense", label: "مصاريف" },
  { id: "purchase", label: "مشتريات" },
  { id: "asset", label: "أصول" },
] as const;

export function PaymentsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [_isPending, startTransition] = useTransition();

  const search = searchParams.get("search") || "";
  const filter = (searchParams.get("filter") as "all" | "expense" | "purchase" | "asset") || "all";
  const category = searchParams.get("category") || "all";
  const natureFilter = searchParams.get("nature") || undefined;

  const newPayment = searchParams.get("newPayment") === "true";
  const newExpense = searchParams.get("newExpense") === "true";
  const newPurchase = searchParams.get("newPurchase") === "true";
  const isNewOpen = newPayment || newExpense || newPurchase;

  const editExpenseId = searchParams.get("editExpense");
  const editPurchaseId = searchParams.get("editPurchase");

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [stopDepreciationAssetId, setStopDepreciationAssetId] = useState<string | null>(null);
  const [actionSheetItem, setActionSheetItem] = useState<PaymentItem | null>(null);

  const deleteExpenseMutation = useDeleteExpense();
  const deletePurchaseMutation = useDeletePurchase();
  const deleteCapitalAssetMutation = useDeleteCapitalAsset();

  const activeExpense = useExpense(editExpenseId || "").data;
  const isLoadingActiveExpense = useExpense(editExpenseId || "").isLoading;

  const activePurchase = usePurchase(editPurchaseId || "").data;
  const isLoadingActivePurchase = usePurchase(editPurchaseId || "").isLoading;

  // استعلام المدفوعات الموحَّدة اللانهائي
  const queryCategory = category === "الكل" || category === "all" ? undefined : category;
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfinitePayments({
    search,
    filter,
    category: filter === "expense" ? queryCategory : undefined,
    nature: natureFilter,
  });

  const payments = data?.pages.flatMap((page) => page.items) || [];
  const visiblePayments = payments;

  // تحديث محددات الـ URL
  const updateUrl = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, val]) => {
      if (val === null) next.delete(key);
      else next.set(key, val);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };

  const handleChipChange = (newFilterId: "all" | "expense" | "purchase" | "asset") => {
    const next = new URLSearchParams(searchParams.toString());
    if (newFilterId === "all") {
      next.delete("filter");
    } else {
      next.set("filter", newFilterId);
    }
    if (newFilterId !== "expense") {
      next.delete("category");
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`);
    });
  };

  // حذف مع تراجع
  const handleDeleteWithUndo = (item: PaymentItem) => {
    const idToDelete = item.id;
    const updatedAt =
      item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt || "");

    if (item.kind === "expense") {
      updateUrl({ editExpense: null });
    } else {
      updateUrl({ editPurchase: null });
    }

    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(idToDelete);
      return next;
    });

    const isExpense = item.kind === "expense";
    scheduleDeleteWithUndo({
      message: isExpense
        ? "سيُحذف المصروف — لا تغلق الصفحة"
        : "سيُحذف الشراء — لا تغلق الصفحة",
      onCommit: async () => {
        const res = isExpense
          ? await deleteExpenseMutation.mutateAsync({ id: idToDelete, updatedAt })
          : await deletePurchaseMutation.mutateAsync({ id: idToDelete, updatedAt });
        if (res.status !== "ok") {
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

  // تأكيد إيقاف الإهلاك
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

  const defaultNewMode = newPurchase ? "purchase" : "expense";

  return (
    <div className="space-y-4 flex-1 flex flex-col pb-36">
      {/* شريط رقاقات الفلترة السريعة (Chips) — سطر 1 دائم بدون سكرول أفقي */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_CHIPS.map((chip) => {
            const isActive = filter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleChipChange(chip.id)}
                className={cn(
                  "min-h-[44px] px-3.5 py-2 rounded-full text-xs font-bold transition-all shrink-0 flex items-center justify-center",
                  isActive
                    ? "bg-ink text-paper shadow-sm"
                    : "bg-canvas text-ink-2 hover:bg-canvas/80 hover:text-ink"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* سطر 2: أدوات إضافية تظهر عند تفعيل فلتر المصاريف فقط (بعرض كامل وأهداف لمس 44px) */}
        {filter === "expense" && (
          <div className="flex items-center gap-2 w-full pt-0.5 animate-fade-in">
            <select
              value={category}
              onChange={(e) =>
                updateUrl({
                  category: e.target.value === "all" || e.target.value === "الكل" ? null : e.target.value,
                })
              }
              className="flex-1 min-w-0 text-xs h-11 min-h-[44px] rounded-lg border border-hairline bg-paper px-3 text-ink focus:outline-none focus:ring-1 focus:ring-info font-medium"
              aria-label="تصفية حسب فئة المصروف"
            >
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat === "الكل" ? "all" : cat}>
                  {cat === "الكل" ? "كل الفئات" : cat}
                </option>
              ))}
            </select>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => updateUrl({ manageCatalog: "expenses" })}
              icon={<Boxes className="w-4 h-4" />}
              className="text-xs shrink-0 min-h-[44px] h-11 px-3"
            >
              إدارة الفئات
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <SkeletonList count={4} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : visiblePayments.length === 0 ? (
        <EmptyState
          title={
            search || filter !== "all" || category !== "all" || natureFilter
              ? "لا توجد نتائج مطابقة"
              : "لا توجد مدفوعات مسجلة حتى الآن"
          }
          description={
            search || filter !== "all" || category !== "all" || natureFilter
              ? "جرب تعديل كلمة البحث أو فلتر النتائج."
              : "سجّل مصاريفك ومشترياتك وخاماتك من مكان واحد لضبط الأرباح بدقة."
          }
          steps={
            search || filter !== "all" || category !== "all" || natureFilter
              ? undefined
              : [
                  "اضغط زر (تسجيل جديد +) العائم أسفل الشاشة",
                  "اختر وضع الإدخال المناسب: مصروف يومي، شراء مواد، أو أصل للورشة",
                  "أدخل المبلغ والتفاصيل واحفظ لتحديث صافي أرباحك فوراً",
                ]
          }
          actionLabel={
            search || filter !== "all" || category !== "all" || natureFilter
              ? undefined
              : "تسجيل جديد (+)"
          }
          onAction={
            search || filter !== "all" || category !== "all" || natureFilter
              ? undefined
              : () => updateUrl({ newPayment: "true" })
          }
        />
      ) : (
        <div className="space-y-3 flex-1 flex flex-col">
          {/* شريط معلومات القائمة: عدّاد الحركات المعروضة + مفتاح الشارات */}
          <div className="flex items-center justify-between gap-2 px-1 text-xs text-ink/50 font-medium flex-wrap">
            <span>{visiblePayments.length} حركة معروضة</span>
            {/* مفتاح الشارات (legend) مع InfoTooltip */}
            <div className="flex items-center gap-2 text-[10px] flex-wrap">
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
          </div>

          <div className="space-y-3">
            {visiblePayments.map((item, idx) => {
              const isWriteoff = item.isInventoryWriteoff === true;
              return (
                <div
                  key={`${item.kind}-${item.id}`}
                  style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                  className={cn(
                    "p-4 bg-paper rounded-lg border shadow-sm flex flex-col gap-2 transition-all animate-fade-slide-in",
                    isWriteoff
                      ? "bg-canvas/50 border-hairline/60 cursor-default opacity-85"
                      : "border-hairline hover:border-ink/20",
                    hiddenIds.has(item.id) ? "opacity-50 pointer-events-none" : ""
                  )}
                >
                  {/* السطر الأول: العنوان والمبلغ وأيقونة الإجراءات */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={cn(
                          "font-bold text-base truncate",
                          isWriteoff ? "text-ink-2" : "text-ink"
                        )}
                      >
                        {item.title || (item.kind === "expense" ? "مصروف عام" : "شراء مواد")}
                      </span>

                      {/* شارة التصنيف الرأسمالي */}
                      {item.isCapitalAsset ? (
                        <span className="px-2 py-0.5 bg-warn-soft text-warn-deep text-[10px] rounded-full font-bold shrink-0">
                          رأس مال
                        </span>
                      ) : item.costNature === "fixed" ? (
                        <span className="px-2 py-0.5 bg-info-soft text-info text-[10px] rounded-full font-bold shrink-0">
                          ثابتة
                        </span>
                      ) : !isWriteoff ? (
                        <span className="px-2 py-0.5 bg-canvas text-ink-3 text-[10px] rounded-full font-bold shrink-0">
                          متغيّرة
                        </span>
                      ) : null}

                      {/* شارة تلقائي لهدر المخزون */}
                      {isWriteoff && (
                        <span
                          className="px-2 py-0.5 bg-emerald-soft text-emerald-deep text-[10px] rounded-full font-bold shrink-0"
                          title="خسارة غير نقدية ناتجة تلقائياً عن تسوية مخزون — لا تُحرَّر من هنا"
                        >
                          تلقائي
                        </span>
                      )}

                      {/* زر إيقاف الإهلاك للأصول ذات الإهلاك النشط */}
                      {item.activeCapitalAssetId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStopDepreciationAssetId(item.activeCapitalAssetId!);
                          }}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center px-3 py-1 bg-warn-soft text-warn-deep text-[11px] rounded-full font-bold border border-warn/30 hover:bg-warn-soft/70 transition-colors shrink-0"
                          title="إيقاف الإهلاك — لن يُخصَم من الربح التشغيلي مستقبلاً"
                        >
                          إيقاف الإهلاك
                        </button>
                      )}
                    </div>

                    <span
                      className={cn(
                        "font-bold text-base flex-shrink-0 tabular-nums",
                        isWriteoff ? "text-ink-2" : "text-ink"
                      )}
                    >
                      <AmountText amount={item.amountCents} />
                    </span>

                    {/* زر الإجراءات ⋯ (مخفي لصفوف الهدر التلقائي) */}
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

                  {/* السطر الثاني: يتكيّف حسب نوع الحركة */}
                  {isWriteoff ? (
                    <div className="flex justify-between items-center text-xs text-ink-3 font-medium">
                      <span>خسارة مخزون — بلا دفع</span>
                      <DateText date={item.date} relative />
                    </div>
                  ) : item.kind === "expense" ? (
                    <div className="flex justify-between items-center text-xs text-ink/60 font-medium">
                      <div className="flex items-center gap-1.5">
                        {item.category && (
                          <span className="px-2.5 py-1 bg-canvas rounded-full text-ink/80 text-[10px] font-bold">
                            {item.category}
                          </span>
                        )}
                        {item.isCapitalAsset && (
                          <span className="text-[10px] text-ink-3">مصروف أصل</span>
                        )}
                      </div>
                      <DateText date={item.date} relative />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs text-ink/60">
                        <span>المورد: {item.supplier || "غير محدد"}</span>
                        {item.quantity && item.unitCostCents !== null && (
                          <div className="flex items-center gap-1">
                            <span>{item.quantity} وحدات × </span>
                            <AmountText amount={item.unitCostCents} />
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center pt-1.5 border-t border-hairline text-[10px] text-ink-3">
                        <DateText date={item.date} relative />
                        {item.notes && (
                          <span className="truncate max-w-[180px]">{item.notes}</span>
                        )}
                      </div>
                    </div>
                  )}
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
        isOpen={isNewOpen}
        onClose={() =>
          updateUrl({ newPayment: null, newExpense: null, newPurchase: null })
        }
        title="تسجيل جديد"
      >
        <SmartFinanceForm
          defaultMode={defaultNewMode}
          onSuccess={() => refetch()}
          onClose={() =>
            updateUrl({ newPayment: null, newExpense: null, newPurchase: null })
          }
        />
      </ResponsiveModal>

      {/* مودال تعديل المصروف */}
      <ResponsiveModal
        isOpen={editExpenseId !== null && editExpenseId !== undefined}
        onClose={() => updateUrl({ editExpense: null })}
        title="تعديل بيانات المصروف"
      >
        {isLoadingActiveExpense ? (
          <div className="p-4 text-center text-sm text-ink-3">جاري التحميل...</div>
        ) : activeExpense?.isInventoryWriteoff ? (
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
                handleDeleteWithUndo({
                  id: activeExpense.id,
                  kind: "expense",
                  date: activeExpense.date,
                  title: activeExpense.description ?? activeExpense.category,
                  amountCents: activeExpense.amountCents,
                  category: activeExpense.category,
                  description: activeExpense.description,
                  supplier: null,
                  quantity: null,
                  unitCostCents: null,
                  notes: null,
                  isCapitalAsset: activeExpense.isCapitalAsset ?? false,
                  costNature: activeExpense.costNature,
                  isInventoryWriteoff: activeExpense.isInventoryWriteoff ?? false,
                  activeCapitalAssetId: null,
                  createdAt: new Date(activeExpense.createdAt),
                  updatedAt: new Date(activeExpense.updatedAt),
                  deletedAt: null,
                });
              }}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              حذف المصروف
            </Button>
          </div>
        )}
      </ResponsiveModal>

      {/* مودال تعديل المشتريات */}
      <ResponsiveModal
        isOpen={editPurchaseId !== null && editPurchaseId !== undefined}
        onClose={() => updateUrl({ editPurchase: null })}
        title="تعديل بيانات المشتريات"
      >
        {isLoadingActivePurchase ? (
          <div className="p-4 text-center text-sm text-ink-3">جاري التحميل...</div>
        ) : (
          <div className="space-y-3">
            <SmartFinanceForm
              initialData={
                activePurchase
                  ? {
                      id: activePurchase.id,
                      updatedAt: activePurchase.updatedAt,
                      type: activePurchase.isCapitalAsset ? "asset" : "purchase",
                      date: new Date(activePurchase.date).toLocaleDateString("en-CA"),
                      amountCents: activePurchase.totalCents,
                      description: activePurchase.notes ?? "",
                      category: activePurchase.item,
                      isCapitalAsset: activePurchase.isCapitalAsset ?? false,
                      costNature:
                        (activePurchase.costNature as "variable" | "fixed" | null) ?? null,
                      itemName: activePurchase.item,
                      supplier: activePurchase.supplier,
                      quantity: activePurchase.quantity,
                      notes: activePurchase.notes ?? "",
                      linkedCatalogComponentId: activePurchase.linkedCatalogComponentId ?? null,
                    }
                  : undefined
              }
              onSuccess={() => refetch()}
              onClose={() => updateUrl({ editPurchase: null })}
            />
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!activePurchase) return;
                handleDeleteWithUndo({
                  id: activePurchase.id,
                  kind: "purchase",
                  date: activePurchase.date,
                  title: activePurchase.item,
                  amountCents: activePurchase.totalCents,
                  category: null,
                  description: null,
                  supplier: activePurchase.supplier,
                  quantity: activePurchase.quantity,
                  unitCostCents: activePurchase.unitCostCents,
                  notes: activePurchase.notes,
                  isCapitalAsset: activePurchase.isCapitalAsset ?? false,
                  costNature: activePurchase.costNature,
                  isInventoryWriteoff: false,
                  activeCapitalAssetId: null,
                  createdAt: new Date(activePurchase.createdAt),
                  updatedAt: new Date(activePurchase.updatedAt),
                  deletedAt: null,
                });
              }}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              حذف المشتريات
            </Button>
          </div>
        )}
      </ResponsiveModal>

      {/* تأكيد إيقاف الإهلاك */}
      <ConfirmDialog
        isOpen={stopDepreciationAssetId !== null}
        title="تأكيد إيقاف الإهلاك"
        message="سيوقف هذا الإهلاك عن تخفيض الربح التشغيلي. الإهلاك المُتراكم حتى الآن سيبقى في الأرقام التاريخية. هل أنت متأكد؟"
        onConfirm={handleConfirmStopDepreciation}
        onCancel={() => setStopDepreciationAssetId(null)}
        isLoading={deleteCapitalAssetMutation.isPending}
      />

      {/* شيت الإجراءات السفلي (تعديل / حذف) */}
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
                    const item = actionSheetItem;
                    setActionSheetItem(null);
                    if (item.kind === "expense") {
                      updateUrl({ editExpense: item.id });
                    } else {
                      updateUrl({ editPurchase: item.id });
                    }
                  },
                },
                {
                  label: "حذف",
                  icon: <Trash2 className="w-5 h-5" />,
                  variant: "danger" as const,
                  onClick: () => {
                    const item = actionSheetItem;
                    setActionSheetItem(null);
                    handleDeleteWithUndo(item);
                  },
                },
              ]
            : []
        }
      />
    </div>
  );
}
