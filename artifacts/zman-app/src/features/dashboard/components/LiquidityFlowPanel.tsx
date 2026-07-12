"use client";

import { Wallet } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

/**
 * حركة الكاش — تقرأ كدفتر واحد من الأعلى للأسفل:
 * رأس المال → مال داخل → مال خارج → النقد المتاح الآن.
 * لا يوجد "صافي الحركة" مجرد — القصة تنتهي بالرصيد الفعلي.
 */
function FlowRow({
  label,
  value,
  barClass,
  textClass,
  sign,
  maxValue,
}: {
  label: string;
  value: number;
  barClass: string;
  textClass: string;
  sign: "+" | "−" | "";
  maxValue: number;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">{label}</span>
        <span className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${textClass}`}>
          {sign && <span>{sign}</span>}
          <AmountText amount={value} />
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
  openingBalanceCents,
  actualBalanceCents,
}: {
  actualSales: number;
  deposits: number;
  ownerInject: number;
  purchases: number;
  expenses: number;
  ownerDraw: number;
  openingBalanceCents: number;
  actualBalanceCents: number;
}) {
  const maxValue = Math.max(actualSales, deposits, ownerInject, purchases, expenses, ownerDraw, openingBalanceCents, 1);

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

      {/* رأس المال / رصيد البداية — أول سطر في التسلسل */}
      {openingBalanceCents > 0 && (
        <FlowRow
          label="رأس المال / رصيد البداية"
          value={openingBalanceCents}
          barClass="bg-ink/20"
          textClass="text-ink-3"
          sign="+"
          maxValue={maxValue}
        />
      )}

      {/* ── مال داخل ── */}
      <div className="pt-1">
        <span className="text-[10px] font-bold text-info uppercase tracking-wide whitespace-nowrap">
          مال داخل
        </span>
      </div>
      <FlowRow
        label="مبيعات مكتملة"
        value={actualSales}
        barClass="bg-info"
        textClass="text-info"
        sign="+"
        maxValue={maxValue}
      />
      <FlowRow
        label="عربونات مستلمة (الفترة)"
        value={deposits}
        barClass="bg-info/70"
        textClass="text-info"
        sign="+"
        maxValue={maxValue}
      />
      <FlowRow
        label="إضافات المالك"
        value={ownerInject}
        barClass="bg-info/50"
        textClass="text-info"
        sign="+"
        maxValue={maxValue}
      />

      {/* ── مال خارج ── */}
      <div className="pt-1">
        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide whitespace-nowrap">
          مال خارج
        </span>
      </div>
      <FlowRow
        label="مشتريات"
        value={purchases}
        barClass="bg-amber-500"
        textClass="text-amber-600"
        sign="−"
        maxValue={maxValue}
      />
      <FlowRow
        label="مصاريف"
        value={expenses}
        barClass="bg-orange-400"
        textClass="text-amber-600"
        sign="−"
        maxValue={maxValue}
      />
      <FlowRow
        label="سحوبات المالك"
        value={ownerDraw}
        barClass="bg-amber-300"
        textClass="text-amber-600"
        sign="−"
        maxValue={maxValue}
      />

      {/* = النقد المتاح الآن — الرقم النهائي المميّز = الرصيد الفعلي */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t-2 border-info/30">
        <span className="text-sm font-black text-ink flex items-center gap-1.5">
          <Wallet className="h-4.5 w-4.5 text-info" />
          النقد المتاح الآن
        </span>
        <span className="text-xl font-black text-info font-mono whitespace-nowrap">
          <AmountText amount={actualBalanceCents} />
        </span>
      </div>

      <p className="text-[10px] text-ink/40 leading-snug">
        هذا رصيدك الفعلي الآن من الصندوق والبنك. الكاش داخل/خارج — ليس ربحاً.
      </p>
    </div>
  );
}
