"use client";

import { useRecentActivities } from "@/features/dashboard/hooks";
import { AmountText } from "@/components/shared/AmountText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ErrorState } from "@/components/shared/ErrorState";
import { AppShellHeader } from "@/providers/app-shell-context";
import { Clock, ShoppingBag, ShoppingCart, ArrowDownRight, TrendingUp, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

const TYPE_META: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  order: { label: "طلب", icon: ShoppingBag, color: "text-info" },
  sale: { label: "مبيعة", icon: TrendingUp, color: "text-info" },
  expense: { label: "مصروف", icon: ArrowDownRight, color: "text-amber-600" },
  purchase: { label: "شراء", icon: ShoppingCart, color: "text-amber-600" },
};

export default function ActivitiesPage() {
  const { data: activities, isLoading, isError, refetch } = useRecentActivities();

  if (isError) {
    return (
      <>
        <AppShellHeader title="كل الحركات المالية" />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState
            message="تعذّر تحميل الحركات المالية. تحقّق من اتصالك."
            onRetry={refetch}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <AppShellHeader title="كل الحركات المالية" />
      <div className="space-y-3 pb-28">
        <div className="flex items-center gap-2 px-1 py-2">
          <Clock className="h-5 w-5 text-info" />
          <h2 className="text-sm font-black text-ink">سجل الحركات المالية</h2>
          <span className="text-[10px] text-ink/40">كل العمليات بالترتيب الزمني</span>
        </div>

        {isLoading ? (
          <SkeletonList count={8} />
        ) : !activities || activities.length === 0 ? (
          <div className="text-center py-20">
            <Clock className="h-12 w-12 text-ink/20 mx-auto mb-3" />
            <p className="text-sm text-ink/50">لا توجد حركات مالية بعد</p>
            <p className="text-xs text-ink/40 mt-1">ابدأ بإنشاء طلب أو تسجيل عملية مالية</p>
          </div>
        ) : (
          <div className="bg-paper rounded-lg border border-hairline shadow-sm divide-y divide-hairline">
            {activities.map((act) => {
              const meta = TYPE_META[act.type] ?? TYPE_META.sale!;
              const Icon = meta.icon;
              const linkHref =
                act.type === "order" ? `/orders?view=${act.id}` :
                act.type === "sale" ? `/finance?tab=sales&editSale=${act.id}` :
                act.type === "expense" ? `/finance?tab=expenses&editExpense=${act.id}` :
                `/finance?tab=purchases&editPurchase=${act.id}`;
              return (
                <Link
                  key={`${act.type}-${act.id}`}
                  href={linkHref}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-canvas transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg bg-canvas shrink-0`}>
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink truncate">{act.title}</p>
                      <p className="text-[10px] text-ink/45 whitespace-nowrap">
                        {act.date ? format(new Date(act.date), "yyyy-MM-dd HH:mm") : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    {act.hasCashImpact && act.amount > 0 ? (
                      <span className={`text-sm font-bold font-mono whitespace-nowrap ${act.type === "order" || act.type === "sale" ? "text-info" : "text-amber-600"}`}>
                        {act.type === "order" || act.type === "sale" ? "+" : "−"}
                        <AmountText amount={act.amount} />
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink/40">—</span>
                    )}
                  </div>
                  <ArrowLeft className="h-4 w-4 text-ink/20 shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
