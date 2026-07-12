"use client";

import { TrendingUp, TrendingDown, Wallet, ArrowDownRight } from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";

/**
 * لوحة تدفق السيولة — مرآة لـ FinanceComparePanel لكن للسيولة (كاش داخل/خارج)
 * بدل الربح. تعرض: الافتتاحي + الوارد + المنصرف + الصافي + التسوية.
 */
function LiquidityRow({
  label,
  value,
  barClass,
  textClass,
  sign,
  maxValue,
  isDashed = false,
}: {
  label: string;
  value: number;
  barClass: string;
  textClass: string;
  sign: "+" | "−" | "";
  maxValue: number;
  isDashed?: boolean;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-ink-2 truncate">{label}</span>
        <span className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${textClass}`}>
          {sign && <span>{sign}</span>}
          <AmountText amount={value} />
        </span>
      </div>
      <div className={`h-2 w-full bg-canvas rounded-full overflow-hidden ${isDashed ? "border border-dashed border-hairline" : ""}`}>
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
}: {
  actualSales: number;
  deposits: number;
  ownerInject: number;
  purchases: number;
  expenses: number;
  ownerDraw: number;
  openingBalanceCents: number;
}) {
  const totalInflows = actualSales + deposits + ownerInject;
  const totalOutflows = purchases + expenses + ownerDraw;
  const netCashFlow = totalInflows - totalOutflows;
  const maxValue = Math.max(actualSales, deposits, ownerInject, purchases, expenses, ownerDraw, 1);
  const isPositive = netCashFlow >= 0;
  const expectedBalance = openingBalanceCents + netCashFlow;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Wallet className="h-4.5 w-4.5 text-info" />
          تدفق السيولة النقدية
        </h3>
        <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded shrink-0">
          للفترة المختارة
        </span>
      </div>

      {/* الرصيد الافتتاحي — سياق فقط، ليس جزءاً من التدفق */}
      {openingBalanceCents > 0 && (
        <>
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <span className="text-xs font-semibold text-ink-3 truncate">
              الرصيد الافتتاحي للمشروع
            </span>
            <span className="text-sm font-bold text-ink-3 font-mono whitespace-nowrap">
              <AmountText amount={openingBalanceCents} />
            </span>
          </div>
          <div className="border-t border-dashed border-hairline" />
        </>
      )}

      {/* الوارد النقدي */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-info uppercase tracking-wide">
            وارد نقد خلال الفترة
          </span>
          <span className="text-[10px] font-bold text-info font-mono">
            +<AmountText amount={totalInflows} />
          </span>
        </div>
        <LiquidityRow
          label="مبيعات محصّلة"
          value={actualSales}
          barClass="bg-info"
          textClass="text-info"
          sign="+"
          maxValue={maxValue}
        />
        <LiquidityRow
          label="عربونات محصّلة"
          value={deposits}
          barClass="bg-info/70"
          textClass="text-info"
          sign="+"
          maxValue={maxValue}
        />
        <LiquidityRow
          label="حقن المالك (رأس مال إضافي)"
          value={ownerInject}
          barClass="bg-info/50"
          textClass="text-info"
          sign="+"
          maxValue={maxValue}
        />
      </div>

      {/* المنصرف النقدي */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-alert uppercase tracking-wide">
            منصرف نقد خلال الفترة
          </span>
          <span className="text-[10px] font-bold text-alert font-mono">
            −<AmountText amount={totalOutflows} />
          </span>
        </div>
        <LiquidityRow
          label="مشتريات مدفوعة"
          value={purchases}
          barClass="bg-alert"
          textClass="text-alert"
          sign="−"
          maxValue={maxValue}
        />
        <LiquidityRow
          label="مصاريف مدفوعة"
          value={expenses}
          barClass="bg-warn-deep"
          textClass="text-warn-deep"
          sign="−"
          maxValue={maxValue}
        />
        <LiquidityRow
          label="سحوبات المالك"
          value={ownerDraw}
          barClass="bg-alert/60"
          textClass="text-alert"
          sign="−"
          maxValue={maxValue}
        />
      </div>

      {/* صافي التدفق النقدي */}
      <div className={`flex items-center justify-between gap-2 pt-3 border-t-2 ${isPositive ? "border-info/30" : "border-alert/30"}`}>
        <span className="text-sm font-bold text-ink flex items-center gap-1.5">
          {isPositive ? <TrendingUp className="h-4.5 w-4.5 text-info" /> : <TrendingDown className="h-4.5 w-4.5 text-alert" />}
          صافي التدفق النقدي للفترة
        </span>
        <span className={`text-lg font-black font-mono whitespace-nowrap flex items-baseline gap-1 ${isPositive ? "text-info" : "text-alert"}`}>
          <span className="text-base">{isPositive ? "+" : "−"}</span>
          <AmountText amount={Math.abs(netCashFlow)} />
        </span>
      </div>

      {/* تسوية: الرصيد المتوقع */}
      {openingBalanceCents > 0 && (
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <span className="text-[10px] text-ink/50">
            الرصيد المتوقع الآن = الافتتاحي + صافي التدفق
          </span>
          <span className="text-xs font-bold text-ink-2 font-mono whitespace-nowrap">
            <AmountText amount={expectedBalance} />
          </span>
        </div>
      )}

      <p className="text-[10px] text-ink/45 leading-snug -mt-2">
        تدفقات نقدية — ليس ربحاً/خسارة. يشمل العربونات المحصّلة وحركة المالك.
      </p>
    </div>
  );
}
