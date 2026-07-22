"use client";

import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import type { MonthlyProfit } from "../queries";

/**
 * ربح كل شهر — بطاقة مستقلة لا يمسّها الفلتر الزمني للوحة.
 * كل سطر = شهر + صافي ربحه (أخضر رابح / أحمر خاسر) مع شريط نسبي.
 * شهر الشراء قد يظهر خسارة وهذا صحيح: الربح تراكمي ويظهر بأشهر البيع.
 */
export function MonthlyProfitPanel({ data }: { data: MonthlyProfit[] }) {
  const maxAbs = Math.max(1, ...data.map((m) => Math.abs(m.netProfitCents)));

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="h-4.5 w-4.5 text-info" />
        <h3 className="text-sm font-bold text-ink">ربح كل شهر</h3>
        <InfoTooltip text="صافي ربح كل شهر على حدة (مبيعات مكتملة − مشتريات − مصاريف). مستقل عن الفلتر بالأعلى. طبيعي أن يظهر شهر الشراء خسارة والبيع ربحاً — الربح تراكمي عبر الأشهر، لا فوري." />
      </div>

      <div className="space-y-2.5">
        {data.map((m) => {
          const isProfit = m.netProfitCents >= 0;
          const pct = Math.round((Math.abs(m.netProfitCents) / maxAbs) * 100);
          return (
            <div key={m.month} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-2 whitespace-nowrap flex items-center gap-1">
                  {isProfit ? (
                    <TrendingUp className="h-3.5 w-3.5 text-info/60" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-alert/60" />
                  )}
                  {m.label}
                </span>
                <span
                  className={`text-sm font-black font-mono whitespace-nowrap ${
                    isProfit ? "text-info" : "text-alert"
                  }`}
                >
                  <AmountText amount={m.netProfitCents} hideCurrency parenNegative />
                </span>
              </div>
              <div className="h-2 w-full bg-canvas rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isProfit ? "bg-info" : "bg-alert"
                  }`}
                  style={{ width: `${Math.max(pct, m.netProfitCents !== 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
