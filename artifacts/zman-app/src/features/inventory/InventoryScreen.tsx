"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpDown, Package } from "lucide-react";
import Link from "next/link";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ErrorState } from "@/components/shared/ErrorState";
import { cn } from "@/lib/utils";
import { useInventoryValuation } from "./hooks";

type SortKey = "alpha" | "lowest" | "highest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "alpha", label: "أبجدي" },
  { key: "lowest", label: "أقل رصيداً" },
  { key: "highest", label: "أعلى قيمة" },
];

export function InventoryScreen() {
  const [sort, setSort] = useState<SortKey>("alpha");
  const { data, isLoading, isError, refetch } = useInventoryValuation();

  const items = data?.items ?? [];

  const lowStockItems = items.filter((i) => i.lowStock);

  const sorted = [...items].sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name, "ar");
    if (sort === "lowest") return a.balance - b.balance;
    if (sort === "highest") return b.bookValueCents - a.bookValueCents;
    return 0;
  });

  return (
    <>
      <AppShellHeader title="المخزون" />

      {/* تنبيه الرصيد المنخفض */}
      {!isLoading && lowStockItems.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl bg-warn-soft border border-warn/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-warn-deep mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warn-deep">
              {lowStockItems.length === 1
                ? "صنف واحد نفد رصيده"
                : `${lowStockItems.length} أصناف نفد رصيدها`}
            </p>
            <p className="text-xs text-warn-deep/80 mt-0.5">
              {lowStockItems.map((i) => i.name).join("، ")}
            </p>
          </div>
        </div>
      )}

      {/* إحصائيات سريعة */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl bg-paper border border-hairline px-4 py-3">
            <p className="text-xs text-ink-3 mb-1">إجمالي الأصناف</p>
            <p className="text-2xl font-bold text-ink">{data.totalCatalogs}</p>
          </div>
          <div className="rounded-xl bg-paper border border-hairline px-4 py-3">
            <p className="text-xs text-ink-3 mb-1">القيمة الدفترية</p>
            <p className="text-lg font-bold text-ink">
              <AmountText amount={data.totalBookValueCents} />
            </p>
          </div>
        </div>
      )}

      {/* شريط الترتيب */}
      {!isLoading && items.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <ArrowUpDown className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
          <div className="flex gap-1.5 flex-wrap">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSort(opt.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                  sort === opt.key
                    ? "bg-info text-white border-info"
                    : "bg-paper text-ink-2 border-hairline hover:border-info/40",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* الحالات */}
      {isLoading && <SkeletonList count={5} />}
      {isError && (
        <ErrorState
          message="تعذّر تحميل بيانات المخزون. حاول مجدداً."
          onRetry={() => refetch()}
        />
      )}

      {/* القائمة */}
      {!isLoading && !isError && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-canvas flex items-center justify-center">
            <Package className="w-7 h-7 text-ink-3" />
          </div>
          <p className="text-sm font-medium text-ink-2">لا يوجد مخزون متتبَّع بعد</p>
          <p className="text-xs text-ink-3 max-w-[220px]">
            فعّل خيار «تتبّع المخزون» على أي صنف في الكتالوج لتظهر هنا
          </p>
          <Link
            href="/catalog"
            className="mt-1 text-xs text-info underline underline-offset-2"
          >
            اذهب إلى الكتالوج
          </Link>
        </div>
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className="flex flex-col gap-2">
          {sorted.map((item) => (
            <div
              key={item.catalogComponentId}
              className={cn(
                "bg-paper rounded-xl border px-4 py-3 flex items-center justify-between gap-3",
                item.lowStock ? "border-warn/30 bg-warn-soft/30" : "border-hairline",
              )}
            >
              {/* الاسم + الوحدة */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{item.name}</p>
                  {item.lowStock && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-warn-deep bg-warn/10 px-1.5 py-0.5 rounded-full">
                      نفد
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-3 mt-0.5">
                  القيمة الدفترية:{" "}
                  <span className="text-ink-2 font-medium">
                    <AmountText amount={item.bookValueCents} />
                  </span>
                </p>
              </div>

              {/* الرصيد */}
              <div className="text-end flex-shrink-0">
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    item.lowStock ? "text-warn-deep" : item.balance > 0 ? "text-ink" : "text-ink-3",
                  )}
                >
                  {item.balance}
                </p>
                <p className="text-[11px] text-ink-3">{item.unit}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
