"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Building2,
  AlertCircle,
  CheckCircle2,
  Clock,
  StopCircle,
  Pencil,
  Lock,
  MoreVertical,
} from "lucide-react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/shared/Button";
import { TextField } from "@/components/shared/TextField";
import { CardActionSheet } from "@/components/shared/CardActionSheet";
import { cn } from "@/lib/utils";
import {
  useCapitalAssets,
  useDeleteCapitalAsset,
  useUpdateCapitalAsset,
} from "./hooks";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import type { CapitalAssetWithDepreciation } from "./assetsQueries";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────
// Issue #11 — مخطّط التحقّق لنموذج تعديل الأصل الرأسمالي.
// 🔒 لا يوجد حقل purchaseAmountCents إطلاقاً — القيمة الأصلية لا تُعدَّل.
// ─────────────────────────────────────────────────────────────────────────
const editAssetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "الاسم مطلوب")
    .max(200, "الاسم طويل جداً"),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح"),
  usefulLifeMonths: z.coerce
    .number()
    .int("يجب أن يكون عدداً صحيحاً")
    .min(1, "الحد الأدنى شهر واحد")
    .max(600, "الحد الأقصى 600 شهر"),
});

type EditAssetFormValues = z.infer<typeof editAssetSchema>;

export function AssetsScreen() {
  const { data: assets, isLoading, isError, refetch } = useCapitalAssets();
  const deleteAsset = useDeleteCapitalAsset();
  const [confirmStop, setConfirmStop] = useState<CapitalAssetWithDepreciation | null>(null);
  // Issue #11 — أصل قيد التعديل (الاسم + تاريخ الشراء + العمر النافع فقط).
  // 🔒 purchaseAmountCents لا يُمرَّر للسيرفر إطلاقاً — يُعرض للقراءة فقط.
  const [editingAsset, setEditingAsset] = useState<CapitalAssetWithDepreciation | null>(null);
  // Issue #15 — شيت إجراءات سفلي لكل بطاقة أصل. يعرض «تعديل» دائماً، و«إيقاف الإهلاك»
  // فقط للأصول غير المستهلكة بالكامل. { asset } + flag منفصل لأن علم isFullyDepreciated
  // على الـ asset نفسه قد لا يكون كافياً لو أردنا لاحقاً التمييز بين الأقسام.
  const [actionSheet, setActionSheet] = useState<{
    asset: CapitalAssetWithDepreciation;
    showStop: boolean;
  } | null>(null);

  const activeAssets = assets?.filter((a) => !a.isFullyDepreciated && !a.isPending) ?? [];
  const doneAssets = assets?.filter((a) => a.isFullyDepreciated) ?? [];
  const pendingAssets = assets?.filter((a) => a.isPending) ?? [];

  async function handleStopDepreciation() {
    if (!confirmStop) return;
    const res = await deleteAsset.mutateAsync(confirmStop.id);
    if (res.status === "ok") {
      toast.success(`تم إيقاف إهلاك «${confirmStop.name}»`);
      setConfirmStop(null);
    } else {
      toast.error(res.message);
    }
  }

  return (
    <>
      <AppShellHeader title="الأصول الرأسمالية" />

      {isLoading && <SkeletonList count={4} />}
      {isError && (
        <ErrorState message="تعذّر تحميل بيانات الأصول الرأسمالية. حاول مجدداً." onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && (assets?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-canvas flex items-center justify-center">
            <Building2 className="w-7 h-7 text-ink-3" />
          </div>
          <p className="text-sm font-medium text-ink-2">
            لا توجد أصول رأسمالية مُسجَّلة بعد
          </p>
          <p className="text-xs text-ink-3 max-w-[240px]">
            عند تسجيل مصروف أو شراء رأسمالي وتفعيل «توزيع شهري (إهلاك)»، يظهر الأصل هنا
          </p>
        </div>
      )}

      {!isLoading && !isError && (assets?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-5">

          {/* الأصول النشطة */}
          {activeAssets.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-ink-3 uppercase tracking-wide mb-2 px-1">
                تحت الإهلاك ({activeAssets.length})
              </h2>
              <div className="flex flex-col gap-2">
                {activeAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpenActions={() =>
                      setActionSheet({ asset, showStop: true })
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* الأصول المستهلكة بالكامل */}
          {doneAssets.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-ink-3 uppercase tracking-wide mb-2 px-1">
                مستهلكة بالكامل ({doneAssets.length})
              </h2>
              <div className="flex flex-col gap-2">
                {doneAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpenActions={() =>
                      setActionSheet({ asset, showStop: false })
                    }
                    fullyDepreciated
                  />
                ))}
              </div>
            </section>
          )}

          {/* الأصول المستقبلية */}
          {pendingAssets.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-ink-3 uppercase tracking-wide mb-2 px-1">
                لم تبدأ بعد ({pendingAssets.length})
              </h2>
              <div className="flex flex-col gap-2">
                {pendingAssets.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpenActions={() =>
                      setActionSheet({ asset, showStop: true })
                    }
                    pending
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* مودال تعديل بيانات الأصل (Issue #11) */}
      <ResponsiveModal
        isOpen={!!editingAsset}
        onClose={() => setEditingAsset(null)}
        title="تعديل بيانات الأصل"
      >
        {editingAsset && (
          <EditAssetForm
            asset={editingAsset}
            onClose={() => setEditingAsset(null)}
          />
        )}
      </ResponsiveModal>

      {/* مودال تأكيد الإيقاف */}
      <ResponsiveModal
        isOpen={!!confirmStop}
        onClose={() => setConfirmStop(null)}
        title="إيقاف الإهلاك"
      >
        {confirmStop && (
          <div className="px-4 pb-4 flex flex-col gap-4">
            <p className="text-sm text-ink-2">
              هل تريد إيقاف إهلاك أصل{" "}
              <span className="font-semibold text-ink">«{confirmStop.name}»</span>؟
            </p>
            <div className="rounded-xl bg-canvas border border-hairline px-4 py-3 text-sm space-y-1.5">
              <InfoRow
                label="القيمة الأصلية"
                value={<AmountText amount={confirmStop.purchaseAmountCents} />}
              />
              <InfoRow
                label="المُهلَك حتى الآن"
                value={<AmountText amount={confirmStop.accumulatedDepreciationCents} />}
              />
              <InfoRow
                label="القيمة المتبقية"
                value={
                  <span
                    className={
                      confirmStop.netBookValueCents > 0 ? "text-info font-semibold" : "text-ink-3"
                    }
                  >
                    <AmountText amount={confirmStop.netBookValueCents} />
                  </span>
                }
              />
            </div>
            <p className="text-xs text-ink-3">
              بعد الإيقاف لن يُخصَم إهلاك هذا الأصل من الربح التشغيلي في أي فترة قادمة. لا يمكن التراجع.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmStop(null)}
                className="flex-1 rounded-xl border border-hairline py-2.5 text-sm font-medium text-ink-2 hover:bg-canvas transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleStopDepreciation}
                disabled={deleteAsset.isPending}
                className="flex-1 rounded-xl bg-alert text-white py-2.5 text-sm font-semibold hover:bg-alert/90 transition-colors disabled:opacity-60"
              >
                {deleteAsset.isPending ? "جاري الإيقاف…" : "إيقاف الإهلاك"}
              </button>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Issue #15 — شيت إجراءات سفلي لكل بطاقة أصل. «تعديل» دائماً؛ «إيقاف الإهلاك»
          فقط للأصول غير المستهلكة بالكامل (showStop=true). */}
      <CardActionSheet
        isOpen={actionSheet !== null}
        onClose={() => setActionSheet(null)}
        title="إجراءات"
        actions={
          actionSheet
            ? [
                {
                  label: "تعديل",
                  icon: <Pencil className="w-5 h-5" />,
                  onClick: () => {
                    const asset = actionSheet.asset;
                    setActionSheet(null);
                    setEditingAsset(asset);
                  },
                },
                ...(actionSheet.showStop
                  ? [
                      {
                        label: "إيقاف الإهلاك",
                        icon: <StopCircle className="w-5 h-5" />,
                        variant: "danger" as const,
                        onClick: () => {
                          const asset = actionSheet.asset;
                          setActionSheet(null);
                          setConfirmStop(asset);
                        },
                      },
                    ]
                  : []),
              ]
            : []
        }
      />
    </>
  );
}

// ─── بطاقة الأصل ───────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onOpenActions,
  fullyDepreciated = false,
  pending = false,
}: {
  asset: CapitalAssetWithDepreciation;
  onOpenActions: () => void;
  fullyDepreciated?: boolean;
  pending?: boolean;
}) {
  const progressPercent =
    asset.purchaseAmountCents > 0
      ? Math.min(
          100,
          Math.round((asset.accumulatedDepreciationCents / asset.purchaseAmountCents) * 100),
        )
      : 0;

  return (
    <div
      className={cn(
        "bg-paper rounded-xl border px-4 py-3 flex flex-col gap-2.5",
        fullyDepreciated ? "border-hairline opacity-70" : "border-hairline",
        pending ? "border-dashed" : "",
      )}
    >
      {/* الرأس: الاسم + حالة + زر ⋯ */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ink">{asset.name}</p>
            {fullyDepreciated && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-deep bg-emerald-soft px-1.5 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> مستهلك بالكامل
              </span>
            )}
            {pending && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-ink-3 bg-canvas px-1.5 py-0.5 rounded-full">
                <Clock className="w-3 h-3" /> لم يبدأ
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-3 mt-0.5">
            تاريخ الشراء: {asset.purchaseDate}
          </p>
        </div>

        {/* Issue #15 — زر ⋯ لفتح شيت الإجراءات السفلي (تعديل/إيقاف الإهلاك) */}
        <button
          type="button"
          onClick={onOpenActions}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-canvas transition-colors flex-shrink-0"
          aria-label="إجراءات"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* شريط التقدم */}
      <div className="w-full h-1.5 bg-canvas rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            fullyDepreciated ? "bg-emerald" : "bg-info",
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* الأرقام */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-ink-3 mb-0.5">القيمة الأصلية</p>
          <p className="text-xs font-semibold text-ink tabular-nums">
            <AmountText amount={asset.purchaseAmountCents} hideCurrency />
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-3 mb-0.5">الإهلاك الشهري</p>
          <p className="text-xs font-semibold text-alert tabular-nums">
            <AmountText amount={asset.monthlyDepreciationCents} hideCurrency />
          </p>
        </div>
        <div>
          <p className="text-[10px] text-ink-3 mb-0.5">القيمة المتبقية</p>
          <p
            className={cn(
              "text-xs font-bold tabular-nums",
              asset.netBookValueCents > 0 ? "text-info" : "text-ink-3",
            )}
          >
            <AmountText amount={asset.netBookValueCents} hideCurrency />
          </p>
        </div>
      </div>

      {/* الأشهر المتبقية */}
      {!fullyDepreciated && !pending && (
        <p className="text-[11px] text-ink-3 text-center">
          {asset.remainingMonths === 0
            ? "ينتهي هذا الشهر"
            : `متبقٍ ${asset.remainingMonths} شهر من أصل ${asset.usefulLifeMonths}`}
        </p>
      )}
      {pending && (
        <p className="text-[11px] text-ink-3 text-center">
          يبدأ الإهلاك في {new Date(asset.startedAt).toLocaleDateString("ar-JO", { year: "numeric", month: "long" })}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink font-medium">{value}</span>
    </div>
  );
}

// ─── نموذج تعديل الأصل الرأسمالي (Issue #11) ──────────────────────────────
// 🔒 يعرض القيمة الأصلية للقراءة فقط. لا يرسل purchaseAmountCents للسيرفر إطلاقاً.
// يُحرِّر: الاسم + تاريخ الشراء (startDate) + العمر النافع فقط.
// ─────────────────────────────────────────────────────────────────────────

function EditAssetForm({
  asset,
  onClose,
}: {
  asset: CapitalAssetWithDepreciation;
  onClose: () => void;
}) {
  const updateAsset = useUpdateCapitalAsset();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditAssetFormValues>({
    resolver: zodResolver(editAssetSchema),
    defaultValues: {
      name: asset.name,
      purchaseDate: asset.purchaseDate,
      usefulLifeMonths: asset.usefulLifeMonths,
    },
  });

  // إعادة ضبط قيم النموذج عند فتح المودال لأصل مختلف (نمط SA3 من
  // DepreciationPromptModal). بدون هذا تبقى قيم الأصل السابق ظاهرة.
  useEffect(() => {
    reset({
      name: asset.name,
      purchaseDate: asset.purchaseDate,
      usefulLifeMonths: asset.usefulLifeMonths,
    });
  }, [asset, reset]);

  const onSubmit = async (values: EditAssetFormValues) => {
    const res = await updateAsset.mutateAsync({
      id: asset.id,
      name: values.name,
      purchaseDate: values.purchaseDate,
      usefulLifeMonths: values.usefulLifeMonths,
      // 🔒 لا نُمرِّر purchaseAmountCents إطلاقاً.
    });
    if (res.status === "ok") {
      toast.success("تم حفظ التعديلات");
      onClose();
    } else {
      toast.error(res.message ?? "فشل التحديث");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
      {/* القيمة الأصلية — للقراءة فقط */}
      <div className="rounded-xl bg-canvas border border-hairline px-4 py-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-ink-3">القيمة الأصلية</span>
          <span className="text-sm font-semibold text-ink tabular-nums">
            <AmountText amount={asset.purchaseAmountCents} />
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <Lock className="w-3 h-3 flex-shrink-0" />
          <span>لا يمكن تعديل القيمة الأصلية</span>
        </div>
      </div>

      <TextField
        label="اسم الأصل *"
        placeholder="مثال: ماكينة خياطة"
        error={errors.name?.message}
        {...register("name")}
      />

      <TextField
        label="تاريخ الشراء *"
        type="date"
        error={errors.purchaseDate?.message}
        {...register("purchaseDate")}
      />

      <TextField
        label="العمر النافع (أشهر) *"
        type="number"
        inputMode="numeric"
        min={1}
        max={600}
        step={1}
        helperText="بين شهر واحد و600 شهر (50 سنة)"
        error={errors.usefulLifeMonths?.message}
        {...register("usefulLifeMonths")}
      />

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={updateAsset.isPending}
        >
          إلغاء
        </Button>
        <Button
          type="submit"
          className="flex-1"
          isLoading={updateAsset.isPending}
        >
          حفظ التعديلات
        </Button>
      </div>
    </form>
  );
}
