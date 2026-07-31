"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { DateText } from "@/components/shared/DateText";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/shared/Button";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { CardActionSheet } from "@/components/shared/CardActionSheet";
import { scheduleDeleteWithUndo } from "@/lib/undo-delete";
import {
  useCreatePurchase,
  useDeletePurchase,
  useInfinitePurchases,
  usePurchase,
} from "../hooks";
import type { NewPurchase } from "../types";
import { PurchaseForm } from "./PurchaseForm";
import { SmartFinanceForm } from "./SmartFinanceForm";
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
  // Issue #12 — قائمة معرّفات الصفوف المُخفاة مؤقتاً انتظاراً للحذف النهائي بعد
  // انتهاء مهلة الـ 5 ثوانٍ للتنبيه. إن ضغط المستخدم «تراجع» يُحذف المعرّف من
  // هذه المجموعة فيُعاد الصف للظهور.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // D7 fix — إيقاف الإهلاك لصف capital_asset نشط.
  const [stopDepreciationAssetId, setStopDepreciationAssetId] = useState<string | null>(null);
  // Issue #15 — شيت إجراءات سفلي لكل صف مشتريات (تعديل/حذف) بدلاً من نقْر البطاقة.
  const [actionSheetItem, setActionSheetItem] = useState<(typeof visiblePurchases)[number] | null>(null);
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
  // Issue #12 — أخفِ الصفوف المُجدوَلة للحذف مع تراجع (optimistic UI). كل صف
  // له تنبيه مستقل بمهلة 5 ثوانٍ، فالقائمة قد تحوي أكثر من صف مُخفي في وقت واحد.
  const visiblePurchases = filteredPurchases.filter((item) => !hiddenIds.has(item.id));

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

  // Issue #12 + #15 — حذف مع تراجع: يُخفي الصف فوراً (optimistic)، يُظهر تنبيه
  // sonner بزر «تراجع» لمدة 5 ثوانٍ، ثم يُنفِّذ الحذف الفعلي عبر useDeletePurchase.
  // إن ضغط المستخدم «تراجع» يُعاد الصف للظهور. إن فشل الحذف (مثل تعارض updatedAt)
  // يُعاد الصف ويُظهر تنبيه خطأ. رسالة الحذف تُذكِّر بأن حذف فاتورة مُصنَّفة كأصل
  // رأسمالي يُلغي الإهلاك المرتبط — هذا يحدث تلقائياً في server action deletePurchase.
  //
  // Issue #15 — حُوِّلت الدالة لتقبل (id, updatedAt) صريحة بدل قراءة editId من
  // URL. هذا يسمح استدعاءها من شيت الإجراءات السفلي (للصف المُختار) ومن زرّ
  // الحذف داخل مودال التعديل (للصف المفتوح).
  const handleDeleteWithUndo = (idToDelete: string, updatedAtRaw: Date | string) => {
    const updatedAt =
      updatedAtRaw instanceof Date ? updatedAtRaw.toISOString() : String(updatedAtRaw || "");
    // أغلق مودال التعديل (إن كان مفتوحاً) ليُغادر المستخدم شاشة التحرير بينما
    // التنبيه ظاهر. إن لم يكن مفتوحاً فهذه لا-عملية.
    updateUrl({ editPurchase: null });
    // أخفِ الصف من القائمة مباشرةً (تحديث متفائل).
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(idToDelete);
      return next;
    });
    scheduleDeleteWithUndo({
      message: "سيُحذف الشراء — لا تغلق الصفحة",
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

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : visiblePurchases.length === 0 ? (
        <EmptyState
          title={search || natureFilter ? "لا توجد نتائج بحث مطابقة" : "لا توجد مشتريات مسجلة حتى الآن"}
          description={
            search || natureFilter
              ? "جرب تعديل كلمة البحث أو فلتر النتائج."
              : "تسجيل المشتريات يساعد في تتبع الخامات المستهلكة وضبط التكلفة."
          }
          steps={
            search || natureFilter
              ? undefined
              : [
                  "اضغط زر (+) العائم أسفل الشاشة",
                  "اختر (تسجيل مشتريات) وأدخل التفاصيل والمبلغ",
                  "حدد ما إذا كانت خامات تشغيلية أو أصل رأسمالي"
                ]
          }
          actionLabel={search || natureFilter ? undefined : "تسجيل مشتريات جديدة (+)"}
          onAction={
            search || natureFilter ? undefined : () => updateUrl({ newPurchase: "true" })
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
            <InfoTooltip text="«رأس مال»: آلة أو أثاث يخدم المشروع لسنوات — لا يُخصم من الربح التشغيلي في الشهر، بل يُهلَّك عبر الزمن (إن فعّلت الإهلاك). «ثابتة»: شراء شهري ثابت تقريباً (اشتراك، راتب). «متغيّرة»: شراء يرتفع وينخفض مع حجم العمل (خامات، تغليف، وقود)." />
          </div>
          <div className="space-y-3">
            {visiblePurchases.map((item, idx) => (
              <div
                key={item.id}
                style={{ animationDelay: `${Math.min(idx, 4) * 60}ms` }}
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2 hover:border-ink/20 transition-all animate-fade-slide-in"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-bold text-ink text-base truncate">
                      {item.item}
                    </span>
                    {/* Phase 2 — شارة التصنيف: رأس مال (warn) / ثابتة (info) / متغيّرة (canvas).
                        SA3: استبدال ألوان Tailwind الخام (amber-100/blue-100) برموز النظام
                        (warn-soft/warn-deep، info-soft/info) لمطابقة SA2 baseline §1.2. */}
                    {item.isCapitalAsset ? (
                      <span className="px-2 py-0.5 bg-warn-soft text-warn-deep text-[10px] rounded-full font-bold shrink-0">رأس مال</span>
                    ) : item.costNature === "fixed" ? (
                      <span className="px-2 py-0.5 bg-info-soft text-info text-[10px] rounded-full font-bold shrink-0">ثابتة</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-canvas text-ink-3 text-[10px] rounded-full font-bold shrink-0">متغيّرة</span>
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
                        className="min-h-[44px] min-w-[44px] inline-flex items-center px-3 py-1 bg-warn-soft text-warn-deep text-[11px] rounded-full font-bold border border-warn/30 hover:bg-warn-soft/70 transition-colors shrink-0"
                        title="إيقاف الإهلاك — لن يُخصَم من الربح التشغيلي مستقبلاً"
                      >
                        إيقاف الإهلاك
                      </button>
                    )}
                  </div>
                  <span className="font-bold text-ink text-base flex-shrink-0">
                    <AmountText amount={item.totalCents} />
                  </span>
                  {/* Issue #15 — زر ⋯ لفتح شيت الإجراءات السفلي (تعديل/حذف). */}
                  <button
                    type="button"
                    onClick={() => setActionSheetItem(item)}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-canvas transition-colors flex-shrink-0"
                    aria-label="إجراءات"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
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
          // Issue #1 — Edit Trap: نستخدم SmartFinanceForm للتعديل بدلاً من PurchaseForm.
          // النموذج يُحدِّث السجل عبر useUpdatePurchase داخلياً. زر الحذف يُعرَض
          // منفصلاً أسفل النموذج لأن SmartFinanceForm لا يُدير الحذف (يبقى من
          // مسؤولية الأب عبر ConfirmDialog القائم).
          <div className="space-y-3">
            <SmartFinanceForm
              initialData={
                activePurchase
                  ? {
                      id: activePurchase.id,
                      updatedAt: activePurchase.updatedAt,
                      type: activePurchase.isCapitalAsset ? "asset" : "purchase",
                      date: new Date(activePurchase.date).toLocaleDateString("en-CA"),
                      // للشراء: amountCents في initialData يُمارَس كـ totalCents للنموذج.
                      amountCents: activePurchase.totalCents,
                      description: activePurchase.notes ?? "",
                      category: activePurchase.item,
                      isCapitalAsset: activePurchase.isCapitalAsset ?? false,
                      costNature:
                        (activePurchase.costNature as "variable" | "fixed" | null) ?? null,
                      itemName: activePurchase.item,
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
                handleDeleteWithUndo(activePurchase.id, activePurchase.updatedAt);
              }}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full"
            >
              حذف المشتريات
            </Button>
          </div>
        )}
      </ResponsiveModal>



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

      {/* Issue #15 — شيت إجراءات سفلي لكل صف مشتريات. المساران:
          - «تعديل» → فتح مودال التعديل عبر URL (?editPurchase=<id>).
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
                    updateUrl({ editPurchase: id });
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
