"use client";

import { useState } from "react";
import {
  Building2,
  AlertCircle,
  CheckCircle2,
  Clock,
  StopCircle,
} from "lucide-react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ErrorState } from "@/components/shared/ErrorState";
import { cn } from "@/lib/utils";
import { useCapitalAssets, useDeleteCapitalAsset } from "./hooks";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import type { CapitalAssetWithDepreciation } from "./assetsQueries";
import { toast } from "sonner";

export function AssetsScreen() {
  const { data: assets, isLoading, isError, refetch } = useCapitalAssets();
  const deleteAsset = useDeleteCapitalAsset();
  const [confirmStop, setConfirmStop] = useState<CapitalAssetWithDepreciation | null>(null);

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
                    onStop={() => setConfirmStop(asset)}
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
                    onStop={() => setConfirmStop(asset)}
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
                    onStop={() => setConfirmStop(asset)}
                    pending
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

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
    </>
  );
}

// ─── بطاقة الأصل ───────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onStop,
  fullyDepreciated = false,
  pending = false,
}: {
  asset: CapitalAssetWithDepreciation;
  onStop: () => void;
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
      {/* الرأس: الاسم + حالة */}
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

        {/* زر إيقاف الإهلاك */}
        {!fullyDepreciated && (
          <button
            type="button"
            onClick={onStop}
            className="flex-shrink-0 flex items-center gap-1 text-[11px] text-alert font-medium hover:bg-alert/5 rounded-lg px-2 py-1 transition-colors"
          >
            <StopCircle className="w-3.5 h-3.5" />
            إيقاف
          </button>
        )}
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
