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
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      const key = `${y}-${m}-${day}`;
      datesMap[key] = { sales: 0, outgoings: 0 };
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

  // احتساب الحد الأقصى للمجموع التراكمي (المكدّس)
  const maxVal = useMemo(() => {
    let max = 1000;
    for (const item of chartData) {
      const sum = item.sales + item.outgoings;
      if (sum > max) max = sum;
    }
    return max;
  }, [chartData]);

  const selected = chartData.find((d) => d.dateStr === selectedDate) ?? null;

  // تنسيق مختصر لأرقام المحور (بالدينار) حتى لا تزدحم: ألف=ك، مليون=م
  const formatAxis = (cents: number) => {
    const jod = cents / 1000;
    if (jod >= 1_000_000) return `${(jod / 1_000_000).toFixed(1)}م`;
    if (jod >= 1000) return `${Math.round(jod / 1000)}ك`;
    return Math.round(jod).toString();
  };

  return (
    <div className="bg-paper p-4 lg:p-6 rounded-lg border border-hairline shadow-sm space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-hairline pb-3">
        <h3 className="text-sm font-bold text-ink">مخطط التدفق المالي اليومي (التراكمي)</h3>
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

      {/* تفصيل اليوم المحدّد (بدل tooltip عائم يُقصّ بالـ overflow) */}
      <div className="min-h-[2.5rem] flex items-center">
        {selected ? (
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs w-full bg-canvas rounded-md px-3 py-2 border border-hairline animate-fade-in">
            <span className="font-mono text-ink/60">{selected.dateStr}</span>
            <span className="text-info font-bold flex items-center gap-1">
              <span>مبيعات:</span>
              <AmountText amount={selected.sales} />
            </span>
            <span className="text-alert font-bold flex items-center gap-1">
              <span>تكاليف:</span>
              <AmountText amount={selected.outgoings} />
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-ink/35 select-none">اضغط عموداً لعرض تفاصيل اليوم</p>
        )}
      </div>

      {/* الرسم البياني: صف واحد = محور القيم (ثابت) + منطقة الأعمدة (قابلة للتمرير) */}
      <div className="flex w-full min-w-0" style={{ height: "16rem" }}>
        {/* محور القيم الرأسي — ثابت، محاذٍ تماماً لمنطقة الرسم (أرقام مختصرة وواضحة) */}
        <div className="flex flex-col justify-between shrink-0 pe-2 text-[11px] font-mono font-semibold text-ink/55 select-none text-end leading-none">
          <span className="flex justify-end">{formatAxis(maxVal)}</span>
          <span className="flex justify-end">{formatAxis(maxVal / 2)}</span>
          <span className="flex justify-end">٠</span>
        </div>

        {/* منطقة الرسم: الشبكة والأعمدة في نفس الإطار بنفس الارتفاع */}
        <div className="relative flex-1 min-w-0">
          {/* خطوط الشبكة الأفقية — تحاذي المحور تماماً (نفس الحاوية، نفس الارتفاع) */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            <div className="w-full border-t border-hairline" />
            <div className="w-full border-t border-hairline" />
            <div className="w-full border-t border-hairline-2" />
          </div>

          {/* الأعمدة المكدّسة (تمرير أفقي على الموبايل — بدون طبقات z طافية) */}
          <div className="absolute inset-0 overflow-x-auto no-scrollbar">
            <div className="h-full flex items-end gap-1.5 min-w-max px-1">
              {chartData.map((item, index) => {
                const total = item.sales + item.outgoings;
                const totalPct = maxVal > 0 ? (total / maxVal) * 100 : 0;
                const salesRatio = total > 0 ? (item.sales / total) * 100 : 0;
                const outRatio = total > 0 ? (item.outgoings / total) * 100 : 0;

                const dayNum = item.dateStr.split("-")[2];
                const isSelected = selectedDate === item.dateStr;

                // عرض كل تسمية يوم ثالثة لتجنب التزاحم
                const showLabel = index % 3 === 0;

                return (
                  <button
                    key={item.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : item.dateStr)}
                    className="relative flex-shrink-0 w-8 flex flex-col items-center justify-end h-full focus:outline-none group cursor-pointer pb-5"
                    title={item.dateStr}
                  >
                    {/* عمود مكدس واحد — ألوان صريحة وواضحة */}
                    <div className="w-full flex items-end justify-center flex-1 min-w-0">
                      {total > 0 ? (
                        <div
                          style={{ height: `${totalPct}%` }}
                          className={`w-4 rounded-t-[3px] overflow-hidden flex flex-col justify-end transition-all duration-150
                            ${isSelected ? "ring-2 ring-ink/40 ring-offset-1" : "group-hover:brightness-95"}
                          `}
                        >
                          {item.sales > 0 && (
                            <div
                              style={{ height: `${salesRatio}%` }}
                              className="w-full bg-info transition-all"
                            />
                          )}
                          {item.outgoings > 0 && (
                            <div
                              style={{ height: `${outRatio}%` }}
                              className="w-full bg-alert transition-all"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="w-4 h-[2px] bg-hairline-2 rounded-sm" />
                      )}
                    </div>
                    {/* تسمية اليوم — مثبّتة أسفل، لا تزيح ارتفاع العمود */}
                    <span className="absolute bottom-0 inset-x-0 text-[11px] text-ink/60 font-mono font-semibold select-none leading-none h-4 flex items-center justify-center">
                      {showLabel ? dayNum : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
