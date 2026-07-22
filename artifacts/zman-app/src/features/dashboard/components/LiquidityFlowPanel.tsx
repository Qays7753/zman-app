"use client";

import { Wallet } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

/**
 * حركة الكاش — ما دخل وما خرج من الصندوق خلال الفترة المختارة، وينتهي بصافي
 * حركة الفترة (الداخل − الخارج). لا يُعرَض هنا الرصيد الافتتاحي/المُرحَّل —
 * الرصيد الفعلي معروض في بطاقة «النقد المتاح» بالأعلى، وتفكيكه في «تركيبة الكاش».
 */
function FlowRow({
  label,
  value,
  barClass,
  textClass,
  maxValue,
  subtracted,
}: {
  label: string;
  value: number;
  barClass: string;
  textClass: string;
  maxValue: number;
  subtracted?: boolean;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">{label}</span>
        <span className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${textClass}`}>
          <AmountText amount={value} hideCurrency alwaysParen={subtracted} parenNegative />
        </span>
      </div>
      <div className="h-2 w-full bg-canvas rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
}

export function LiquidityFlowPanel({
  actualSales,
  deposits,
  ownerInject,
  purchases,
  expenses,
  ownerDraw,
}: {
  actualSales: number;
  deposits: number;
  ownerInject: number;
  purchases: number;
  expenses: number;
  ownerDraw: number;
}) {
  const maxValue = Math.max(actualSales, deposits, ownerInject, purchases, expenses, ownerDraw, 1);
  const netFlow = actualSales + deposits + ownerInject - purchases - expenses - ownerDraw;
  const isPositive = netFlow >= 0;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Wallet className="h-4.5 w-4.5 text-info" />
          حركة الكاش
          <InfoTooltip text="كل ما دخل وخرج من الصندوق خلال الفترة المختارة. يشمل المبيعات والعربونات والمشتريات والمصاريف وحركة المالك. هذا ليس ربحاً — العربون نقد لكنه التزام حتى التسليم، وسحب المالك ليس مصروفاً." />
        </h3>
        <span className="text-[10px] text-ink/40 whitespace-nowrap">كاش — ليس ربحاً</span>
      </div>

      {/* ما دخل وما خرج خلال الفترة */}
      <div className="space-y-2.5">
        <FlowRow
          label="مبيعات مكتملة"
          value={actualSales}
          barClass="bg-info"
          textClass="text-info"
          maxValue={maxValue}
        />
        <FlowRow
          label="عربونات مستلمة (الفترة)"
          value={deposits}
          barClass="bg-info/70"
          textClass="text-info"
          maxValue={maxValue}
        />
        <FlowRow
          label="إضافات المالك"
          value={ownerInject}
          barClass="bg-info/50"
          textClass="text-info"
          maxValue={maxValue}
        />
        <FlowRow
          label="مشتريات"
          value={purchases}
          barClass="bg-amber-500"
          textClass="text-amber-600"
          maxValue={maxValue}
          subtracted
        />
        <FlowRow
          label="مصاريف"
          value={expenses}
          barClass="bg-orange-400"
          textClass="text-amber-600"
          maxValue={maxValue}
          subtracted
        />
        <FlowRow
          label="سحوبات المالك"
          value={ownerDraw}
          barClass="bg-amber-300"
          textClass="text-amber-600"
          maxValue={maxValue}
          subtracted
        />
      </div>

      {/* = صافي حركة الفترة — الداخل ناقص الخارج */}
      <div className={`flex items-center justify-between gap-2 pt-3 border-t-2 ${isPositive ? "border-info/30" : "border-alert/30"}`}>
        <span className="text-sm font-black text-ink flex items-center gap-1.5">
          <Wallet className="h-4.5 w-4.5 text-info" />
          صافي حركة الفترة
        </span>
        <span className={`text-xl font-black font-mono whitespace-nowrap ${isPositive ? "text-info" : "text-alert"}`}>
          <AmountText amount={netFlow} hideCurrency parenNegative />
        </span>
      </div>
    </div>
  );
}
