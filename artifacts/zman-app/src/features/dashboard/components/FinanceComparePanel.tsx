"use client";

/**
 * FinanceComparePanel — أشرطة مقارنة (مبيعات · مشتريات · مصاريف) + الربح التشغيلي.
 * مُستخرَج من DashboardClient (Round 3 UX refactor).
 * لا تغيير على أي منطق — إعادة هيكلة فقط.
 *
 * D3 fix (SA2): التسمية صريحة «الربح التشغيلي (بعد الإهلاك)» لتمييزها عن
 * «الربح النقدي المحتجز (قبل الإهلاك)» في DetailsLayer.
 */

import {
  BarChart3,
  PackageOpen,
  TrendingDown,
  TrendingUp,
  User,
} from "lucide-react";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";

interface FinanceComparePanelProps {
  actualSales: number;
  /** UX Round 4 — COGS للفترة (بدلاً من إجمالي المشتريات). */
  cogsCents: number;
  /** Fix A — مصاريف تشغيلية فقط (is_capital_asset=false). تتطابق مع ما يُطرح من netProfit. */
  operatingExpenses: number;
  /** Fix B — مشتريات تشغيلية (غير رأسمالية وغير مخزون متتبَّع). تُطرح من netProfit. */
  operatingPurchases: number;
  /** Fix C — إهلاك الفترة (غير نقدي). يُطرح من netProfit. */
  depreciation: number;
  netProfit: number;
  ownerDraw: number;
  expectedRemaining: number;
  /** Fix D — مشتريات رأسمالية + مخزون متتبَّع فقط (لم تُطرح من الربح). للتلميح التوعوي. */
  nonOperatingPurchases: number;
}

export function FinanceComparePanel({
  actualSales,
  cogsCents,
  operatingExpenses,
  operatingPurchases,
  depreciation,
  netProfit,
  ownerDraw,
  expectedRemaining,
  nonOperatingPurchases,
}: FinanceComparePanelProps) {
  const rows = [
    {
      label: "مبيعات",
      value: actualSales,
      barClass: "bg-info",
      textClass: "text-info",
      subtracted: false,
    },
    {
      label: "تكلفة المبيعات",
      value: cogsCents,
      barClass: "bg-amber-500",
      textClass: "text-amber-600",
      subtracted: true,
      tooltip: "ثمن الخامات والمواد التي استُخدمت فعلياً في الطلبات المُسلمة فقط.",
    },
    {
      label: "مصاريف تشغيلية",
      value: operatingExpenses,
      barClass: "bg-orange-400",
      textClass: "text-orange-600",
      subtracted: true,
    },
    ...(operatingPurchases > 0
      ? [
          {
            label: "مشتريات تشغيلية",
            value: operatingPurchases,
            barClass: "bg-rose-400",
            textClass: "text-rose-600",
            subtracted: true,
          },
        ]
      : []),
    ...(depreciation > 0
      ? [
          {
            label: "إهلاك الفترة",
            value: depreciation,
            barClass: "bg-slate-400",
            textClass: "text-slate-500",
            subtracted: true,
            tooltip: "توزيع تكلفة الآلة أو الأصل على عدة أشهر حتى لا تُسجل كخسارة في شهر واحد.",
          },
        ]
      : []),
  ];
  const maxValue = Math.max(actualSales, cogsCents, operatingExpenses, operatingPurchases, depreciation, 1);
  const isProfit = netProfit >= 0;
  const afterDraw = netProfit - ownerDraw;
  const isAfterDrawPositive = afterDraw >= 0;
  const futureProfit = netProfit + expectedRemaining;
  const isFutureProfit = futureProfit >= 0;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <BarChart3 className="h-4.5 w-4.5 text-info" />
          الربح التشغيلي
          <InfoTooltip text="الربح التشغيلي = مبيعات − تكلفة البضاعة المباعة (COGS) − مصاريف تشغيلية − إهلاك الفترة. تكلفة البضاعة المباعة ≠ مشتريات المخزون — المشتريات تزيد قيمة مخزونك، والتكلفة تُحتسب فقط عند تسليم الطلبات." />
        </h3>
        <span className="text-[10px] text-ink/40 whitespace-nowrap">للفترة المختارة</span>
      </div>

      {/* الأشرطة النسبية */}
      <div className="space-y-2.5">
        {rows.map((row) => {
          const pct = Math.round((row.value / maxValue) * 100);
          return (
            <div key={row.label} className="space-y-1 pe-16">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-2 whitespace-nowrap flex items-center gap-1">
                  {row.label}
                  {row.tooltip && <InfoTooltip text={row.tooltip} />}
                </span>
                <span
                  className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${row.textClass}`}
                >
                  <AmountText
                    amount={row.value}
                    hideCurrency
                    alwaysParen={row.subtracted}
                    parenNegative
                  />
                </span>
              </div>
              <div className="h-2.5 w-full bg-canvas rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${row.barClass}`}
                  style={{ width: `${Math.max(pct, row.value > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Fix D — تلميح توعوي: مشتريات مخزون + رأسمالية فقط (لم تُطرح من الربح) */}
      {nonOperatingPurchases > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-info/8 border border-info/15">
          <PackageOpen className="h-3.5 w-3.5 text-info shrink-0 mt-0.5" />
          <p className="text-[11px] text-info/80 leading-relaxed">
            اشتريت مخزوناً أو أصولاً بـ{" "}
            <strong className="text-info font-black"><AmountText amount={nonOperatingPurchases} hideCurrency /></strong>{" "}
            هذه الفترة —{" "}
            <span className="font-semibold">هذا المبلغ لم يُطرَح من ربحك</span>، بل أضيف لقيمة مخزونك أو أصولك. الربح يتأثر فقط عند تسليم الطلبات.
          </p>
        </div>
      )}

      {/* جسر توضيحي */}
      <p className="text-[11px] text-ink/45 leading-relaxed border-t border-hairline pt-2.5">
        المشتريات التي لم تُبع بعد لا تُخصم من ربحك، بل تُحفظ كقيمة في مخزونك وتُحتسب تكلفتها عند تسليم الطلبات.
      </p>

      {/* الربح التشغيلي — الرقم الأساسي */}
      <div
        className={`flex items-center justify-between gap-2 pt-3 border-t-2 ${
          isProfit ? "border-info/30" : "border-alert/30"
        }`}
      >
        <span className="text-sm font-bold text-ink flex items-center gap-1.5">
          {isProfit ? (
            <TrendingUp className="h-4.5 w-4.5 text-info" />
          ) : (
            <TrendingDown className="h-4.5 w-4.5 text-alert" />
          )}
          الربح التشغيلي (بعد الإهلاك)
          <InfoTooltip text="الربح التشغيلي (بعد الإهلاك) = مبيعات − مشتريات − مصاريف − إهلاك الفترة. يختلف عن «الربح النقدي المحتجز (قبل الإهلاك)» في التفاصيل المالية — الفرق = إهلاك الفترة. راجع ACCOUNTING_RULES.md §10." />
        </span>
        <span
          className={`text-lg font-black font-mono whitespace-nowrap flex items-baseline gap-1 ${
            isProfit ? "text-info" : "text-alert"
          }`}
        >
          <AmountText amount={netProfit} hideCurrency parenNegative />
        </span>
      </div>

      {/* صافي الربح بعد سحوبات المالك */}
      {ownerDraw > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-hairline">
          <span className="text-xs font-semibold text-ink/60 flex items-center gap-1">
            <User className="h-3.5 w-3.5 text-ink/40" />
            صافي الربح بعد سحوبات المالك
          </span>
          <span
            className={`text-sm font-bold font-mono whitespace-nowrap ${
              isAfterDrawPositive ? "text-info" : "text-alert"
            }`}
          >
            <AmountText amount={afterDraw} hideCurrency parenNegative />
          </span>
        </div>
      )}

      {/* الربح المتوقّع بعد تسليم الطلبات */}
      {expectedRemaining > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-hairline">
          <span className="text-xs font-semibold text-ink/60 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-info/50" />
            الربح المتوقّع بعد تسليم طلباتك
          </span>
          <span
            className={`text-sm font-bold font-mono whitespace-nowrap ${
              isFutureProfit ? "text-info" : "text-alert"
            }`}
          >
            <AmountText amount={futureProfit} hideCurrency parenNegative />
          </span>
        </div>
      )}
    </div>
  );
}
