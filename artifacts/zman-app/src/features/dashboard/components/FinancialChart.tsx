"use client";

import { useMemo, useState } from "react";
import { AmountText } from "@/components/shared/AmountText";

interface FinancialChartProps {
  salesData: { day: string; total: number }[];
  expensesData: { day: string; total: number }[];
  purchasesData: { day: string; total: number }[];
  startDate: string;
  endDate: string;
}

export default function FinancialChart({
  salesData,
  expensesData,
  purchasesData,
  startDate,
  endDate,
}: FinancialChartProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const chartData = useMemo(() => {
    const datesMap: Record<string, { sales: number; outgoings: number }> = {};

    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0] ?? "";
      if (key) datesMap[key] = { sales: 0, outgoings: 0 };
    }

    for (const item of salesData) {
      if (item.day) {
        const entry = datesMap[item.day];
        if (entry) entry.sales += item.total;
      }
    }
    for (const item of expensesData) {
      if (item.day) {
        const entry = datesMap[item.day];
        if (entry) entry.outgoings += item.total;
      }
    }
    for (const item of purchasesData) {
      if (item.day) {
        const entry = datesMap[item.day];
        if (entry) entry.outgoings += item.total;
      }
    }

    return Object.entries(datesMap)
      .map(([date, val]) => ({ dateStr: date, sales: val.sales, outgoings: val.outgoings }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [salesData, expensesData, purchasesData, startDate, endDate]);

  const maxVal = useMemo(() => {
    let max = 1000;
    for (const item of chartData) {
      if (item.sales > max) max = item.sales;
      if (item.outgoings > max) max = item.outgoings;
    }
    return max;
  }, [chartData]);

  const selected = chartData.find((d) => d.dateStr === selectedDate) ?? null;

  return (
    <div className="bg-paper p-4 lg:p-6 rounded-lg border border-hairline shadow-sm space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-hairline pb-3">
        <h3 className="text-sm font-bold text-ink">مخطط التدفق المالي اليومي</h3>
        <div className="flex gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-info rounded-sm flex-shrink-0" />
            <span className="text-ink/75">المبيعات</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-alert rounded-sm flex-shrink-0" />
            <span className="text-ink/75">التكاليف</span>
          </div>
        </div>
      </div>

      {/* الرسم البياني */}
      <div className="relative w-full min-w-0">
        {/* خطوط الشبكة الخلفية (ثابتة في الخلفية) */}
        <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none z-0">
          <div className="w-full border-t border-hairline/40 text-[11px] text-ink/35 flex justify-end pe-1 leading-none pt-0.5 select-none">
            <AmountText amount={maxVal} />
          </div>
          <div className="w-full border-t border-hairline/40 text-[11px] text-ink/35 flex justify-end pe-1 leading-none pt-0.5 select-none">
            <AmountText amount={maxVal / 2} />
          </div>
          <div className="w-full border-t border-hairline text-[11px] text-ink/35 flex justify-end pe-1 leading-none select-none">
            <span>٠</span>
          </div>
        </div>

        {/* الأعمدة (قابلة للتمرير أفقيًا على الموبايل) */}
        <div className="relative z-10 w-full overflow-x-auto no-scrollbar">
          <div className="h-64 flex items-end pb-6 pt-16 gap-1.5 min-w-max px-1">
            {chartData.map((item, index) => {
              const salesPct = maxVal > 0 ? (item.sales / maxVal) * 100 : 0;
              const outPct = maxVal > 0 ? (item.outgoings / maxVal) * 100 : 0;
              const dayNum = item.dateStr.split("-")[2];
              const isSelected = selectedDate === item.dateStr;

              // عرض كل تسمية يوم ثالثة لتجنب التزاحم
              const showLabel = index % 3 === 0;

              return (
                <button
                  key={item.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : item.dateStr)}
                  className="relative flex-shrink-0 w-8 flex flex-col items-center justify-end h-full focus:outline-none group cursor-pointer"
                  title={item.dateStr}
                >
                  {/* Tooltip عائم */}
                  {isSelected && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 bg-ink text-paper text-[10px] rounded p-2 shadow-lg min-w-[110px] text-center select-text pointer-events-auto border border-hairline-2">
                      <p className="font-mono text-paper/70 border-b border-paper/10 pb-0.5 mb-1">{item.dateStr}</p>
                      <p className="text-info font-bold">مبيعات: {(item.sales / 1000).toFixed(1)} د.أ</p>
                      <p className="text-alert font-bold">تكاليف: {(item.outgoings / 1000).toFixed(1)} د.أ</p>
                    </div>
                  )}

                  <div className="w-full flex items-end justify-center gap-0.5 flex-1 min-w-0">
                    <div
                      style={{ height: `${salesPct}%` }}
                      className={`w-[6px] min-w-[4px] bg-info rounded-t-[2px] transition-all duration-150
                        ${isSelected ? "opacity-100 ring-1 ring-info/50" : "opacity-60 group-hover:opacity-90"}
                      `}
                    />
                    <div
                      style={{ height: `${outPct}%` }}
                      className={`w-[6px] min-w-[4px] bg-alert rounded-t-[2px] transition-all duration-150
                        ${isSelected ? "opacity-100 ring-1 ring-alert/50" : "opacity-60 group-hover:opacity-90"}
                      `}
                    />
                  </div>
                  <span className="text-[11px] text-ink/40 font-mono mt-1.5 select-none leading-none block h-3">
                    {showLabel ? dayNum : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
