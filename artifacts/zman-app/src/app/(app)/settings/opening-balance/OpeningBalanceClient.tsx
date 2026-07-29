"use client";

import { Lock, ShieldCheck } from "lucide-react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { useOpeningBalance } from "@/features/finance/hooks";
import { OpeningTab } from "@/features/finance/components/OpeningTab";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { AmountText } from "@/components/shared/AmountText";

export default function OpeningBalanceClient() {
  const { data: opBal, isLoading } = useOpeningBalance();

  return (
    <>
      <AppShellHeader title="الأرصدة الافتتاحية" />

      <div className="flex-1 p-4 max-w-xl mx-auto w-full space-y-6">
        {isLoading ? (
          <SkeletonList count={3} />
        ) : opBal?.isLocked ? (
          <div className="bg-paper border border-hairline rounded-lg p-6 space-y-6 shadow-sm">
            <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-md border border-emerald-200 dark:border-emerald-900/50">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-sm">الأرصدة الافتتاحية مثبتة نهائياً</h3>
                <p className="text-xs text-ink-2 mt-0.5">
                  تم قفل الميزان الافتتاحي بنجاح لضمان سلامة العمليات والدفتر المحاسبي.
                </p>
              </div>
            </div>

            <div className="space-y-4 divide-y divide-hairline">
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-ink-2">تاريخ بدء العمل بالنظام</span>
                <span className="text-sm font-semibold dir-ltr">{opBal.goLiveDate}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-sm text-ink-2">رصيد الصندوق الافتتاحي</span>
                <AmountText amount={opBal.cashCents / 1000} className="text-sm font-semibold" />
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-sm text-ink-2">رصيد البنك الافتتاحي</span>
                <AmountText amount={opBal.bankCents / 1000} className="text-sm font-semibold" />
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-sm font-bold text-ink">رأس المال الافتتاحي</span>
                <AmountText amount={opBal.capitalCents / 1000} className="text-sm font-bold text-info" />
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-ink-3 pt-2">
              <Lock className="w-3.5 h-3.5" />
              <span>هذه الأرقام مقفلة ومؤكدة تاريخياً</span>
            </div>
          </div>
        ) : (
          <OpeningTab />
        )}
      </div>
    </>
  );
}
