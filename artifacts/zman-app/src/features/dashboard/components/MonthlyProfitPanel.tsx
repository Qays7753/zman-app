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
  const currentMonth = data[0]?.month;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <img
            src="/brand/zman-rosette-primary.svg"
            alt=""
            aria-hidden="true"
            className="h-5 w-5 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-ink">ربح كل شهر</h3>
              <InfoTooltip text="صافي ربح كل شهر على حدة (مبيعات مكتملة − مشتريات − مصاريف). مستقل عن الفلتر بالأعلى. طبيعي أن يظهر شهر الشراء خسارة والبيع ربحاً — الربح تراكمي عبر الأشهر، لا فوري." />
            </div>
            <p className="text-[10px] font-semibold text-ink-3 mt-0.5">
              آخر {data.length} أشهر · مستقل عن الفترة المحددة
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-brand-deep bg-brand-soft px-2 py-1 rounded-full shrink-0">
          اتجاه
        </span>
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
                    <TrendingUp className="h-3.5 w-3.5 text-brand/60" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-alert/60" />
                  )}
                  {m.label}
                  {m.month === currentMonth && (
                    <span className="text-[9px] font-bold text-brand-deep bg-brand-soft px-1.5 py-0.5 rounded-full">
                      الحالي
                    </span>
                  )}
                </span>
                <span
                  className={`text-sm font-black font-mono whitespace-nowrap ${
                    isProfit ? "text-brand" : "text-alert"
                  }`}
                >
                  <AmountText amount={m.netProfitCents} hideCurrency parenNegative />
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={Math.max(pct, m.netProfitCents !== 0 ? 4 : 0)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`صافي ربح ${m.label}`}
                className="relative h-3 w-full bg-canvas rounded-full overflow-hidden"
              >
                <span className="absolute inset-y-0 start-1/2 w-px bg-border-strong/35" aria-hidden="true" />
                <div
                  className={`absolute inset-y-0 rounded-full transition-all duration-500 ${
                    isProfit ? "end-1/2 bg-brand" : "start-1/2 bg-alert"
                  }`}
                  style={{ width: `${Math.max(pct / 2, m.netProfitCents !== 0 ? 2 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
