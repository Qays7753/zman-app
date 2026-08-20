"use client";

/**
 * DetailsLayer — الطبقة الثانية القابلة للطي (Round 3 UX refactor).
 * تحتوي على التفاصيل المالية العميقة التي لا يحتاجها المالك في كل زيارة:
 *   1. قيمة المخزون (+ رابط /inventory)
 *   2. إضافات الأصول الرأسمالية + إهلاك الفترة (+ رابط /assets)
 *   3. أبرز المصاريف
 *   4. الربح مقابل السيولة (التفكيك المحاسبي الكامل)
 *   5. حالة الطلبات التشغيلية
 *
 * الحالة (expanded/collapsed) محفوظة في localStorage لتذكّر تفضيل المالك.
 * لا يُلمَس أي منطق محاسبي — إعادة هيكلة UI فقط.
 */

import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Package,
  Landmark,
  ArrowDownRight,
  ClipboardList,
  TrendingDown,
  Wallet,
  Scale,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { AmountText } from "@/components/shared/AmountText";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/status-colors";

// ── أنواع البيانات (مُستنبَطة من الـ hooks الموجودة) ──────────────────────

interface SummaryAllTime {
  capitalAdditionsCents?: number;
  monthlyDepreciationCents?: number;
  inventoryValueCents?: number;
}

interface FinancialPosition {
  assets: { totalCents: number; inventoryValueCents?: number };
  equity: {
    openingCashInEquityCents: number;
    injectionsCents: number;
    drawingsCents: number;
    retainedProfitCents: number;
    capitalAdditionsCents?: number;
    totalCents: number;
  };
  liabilities: { depositsCents: number };
}

interface DashboardStats {
  topExpenses: { category: string; totalCents: number; count: number }[];
  ordersByStatus: Record<string, number>;
}

interface DetailsLayerProps {
  periodLabel?: string;
  summaryAllTime: SummaryAllTime | undefined;
  position: FinancialPosition | undefined;
  stats: DashboardStats | undefined;
  /** ربح الفترة المختارة — مُنقَّل من بطاقة الصحة (Round 6) */
  netProfit?: number;
  /** سحوبات المالك في الفترة المختارة — مُنقَّل من بطاقة الصحة (Round 6) */
  ownerDraw?: number;
  /** صافي قيمة الأصول الرأسمالية as-of endDate — مُنقَّل من بطاقة الصحة (Round 6) */
  capitalAssetsNetValueCents?: number;
}

const LS_KEY = "zman_details_expanded";

export function DetailsLayer({
  periodLabel,
  summaryAllTime,
  position,
  stats,
  netProfit = 0,
  ownerDraw = 0,
  capitalAssetsNetValueCents = 0,
}: DetailsLayerProps) {
  const [expanded, setExpanded] = useState(false);

  // استعادة تفضيل المالك من localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "1") setExpanded(true);
    } catch {
      /* ignore SSR / private mode */
    }
  }, []);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ── قيم مشتقة ────────────────────────────────────────────────────────────

  const inventoryValue =
    summaryAllTime?.inventoryValueCents ??
    position?.assets.inventoryValueCents ??
    0;

  const capitalAdditions = summaryAllTime?.capitalAdditionsCents ?? 0;
  const depreciation = summaryAllTime?.monthlyDepreciationCents ?? 0;

  // تركيبة الربح مقابل السيولة
  const positionData = position
    ? {
        realCash: position.assets.totalCents,
        opening: position.equity.openingCashInEquityCents,
        ownerNet:
          position.equity.injectionsCents - position.equity.drawingsCents,
        depositsHeld: position.liabilities.depositsCents,
        profit: position.equity.retainedProfitCents,
        capitalAdditions: position.equity.capitalAdditionsCents ?? 0,
        inventoryValue: position.assets.inventoryValueCents ?? 0,
      }
    : null;

  const residual = positionData
    ? positionData.realCash -
      (positionData.opening +
        positionData.ownerNet +
        positionData.depositsHeld +
        positionData.profit -
        positionData.capitalAdditions)
    : 0;

  const pendingCount =
    (stats?.ordersByStatus["sent"] ?? 0) +
    (stats?.ordersByStatus["confirmed"] ?? 0);

  return (
    <div className="space-y-1">
      {/* زر التبديل */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-hairline bg-canvas hover:bg-canvas/80 active:scale-[0.99] transition-all min-h-[52px]"
        aria-expanded={expanded}
      >
        <div className="min-w-0 text-start">
          <span className="block text-sm font-bold text-ink/70">
            {expanded ? "إخفاء التفاصيل المالية" : "عرض التفاصيل المالية"}
          </span>
          {!expanded && (
            <span className="mt-0.5 block truncate text-[10px] font-semibold text-ink/45">
              ربح الفترة: <AmountText amount={netProfit} hideCurrency />
              <span className="mx-1">·</span>
              {pendingCount > 0 ? `${pendingCount} طلبات معلّقة` : "لا توجد طلبات معلّقة"}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-brand shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-brand shrink-0" />
        )}
      </button>

      {/* المحتوى القابل للطي */}
      {expanded && (
        <div className="space-y-4 pt-2">
          <div className="rounded-lg border border-info/20 bg-info-soft px-3 py-2 text-[11px] font-semibold leading-relaxed text-ink-2">
            الفترة المختارة: {periodLabel ?? "الفترة الحالية"}. بعض القيم هنا تراكمية أو تمثل الوضع حتى نهاية الفترة، مثل قيمة المخزون وصافي قيمة المشروع.
          </div>

          {/* ── 0. مؤشرات الصحة التفصيلية (مُنقَّلة من بطاقة الصحة R6) ── */}
          {(ownerDraw > 0 || position?.equity.totalCents !== 0 || capitalAssetsNetValueCents > 0) && (
            <div className="bg-paper rounded-lg border border-hairline shadow-sm divide-y divide-hairline overflow-hidden">
              {/* صافي ربح الفترة بعد السحوبات */}
              {ownerDraw > 0 && (() => {
                const afterDraw = netProfit - ownerDraw;
                const isPos = afterDraw >= 0;
                return (
                  <div className={`px-4 py-2.5 flex items-center justify-between gap-2 ${isPos ? "bg-brand-soft" : "bg-alert/5"}`}>
                    <span className="text-[11px] font-semibold text-ink/60 flex items-center gap-1 whitespace-nowrap">
                      <ArrowDownRight className="h-3.5 w-3.5 text-ink/40 shrink-0" />
                      صافي ربح الفترة بعد السحوبات
                    </span>
                    <span className={`text-sm font-black font-mono whitespace-nowrap ${isPos ? "text-brand-deep" : "text-alert"}`}>
                      <AmountText amount={afterDraw} hideCurrency parenNegative />
                    </span>
                  </div>
                );
              })()}
              {/* صافي قيمة المشروع السائل */}
              {(position?.equity.totalCents ?? 0) !== 0 && (
                <div className="bg-brand-soft px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-brand-deep/80 flex items-center gap-1 whitespace-nowrap">
                    <Landmark className="h-3.5 w-3.5 text-brand shrink-0" />
                    صافي قيمة المشروع (السائل)
                    <InfoTooltip text="النقد + المخزون − العربون = حقوق ملكيتك السائلة. محسوبة على الأساس النقدي البحت (لا يُطرح منها الإهلاك). الفرق بينها وبين الربح التراكمي = إجمالي الإهلاك المتراكم." />
                  </span>
                  <span className="text-sm font-black text-brand-deep font-mono whitespace-nowrap">
                    <AmountText amount={position!.equity.totalCents} hideCurrency parenNegative />
                  </span>
                </div>
              )}
              {/* صافي قيمة الأصول الرأسمالية */}
              {capitalAssetsNetValueCents > 0 && (
                <div className="bg-warm px-4 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink-2 flex items-center gap-1 whitespace-nowrap">
                    <Wrench className="h-3.5 w-3.5 text-ink-2 shrink-0" />
                    صافي قيمة الأصول الرأسمالية
                    <InfoTooltip text="القيمة الدفترية الصافية لآلاتك وأثاثك بعد خصم الإهلاك المتراكم حتى نهاية الفترة." />
                  </span>
                  <span className="text-sm font-black text-ink-2 font-mono whitespace-nowrap">
                    <AmountText amount={capitalAssetsNetValueCents} hideCurrency />
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 1. قيمة المخزون ──────────────────────────────────────── */}
          <div className="bg-brand-soft rounded-lg border border-brand/30 shadow-sm p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Package className="h-5 w-5 text-brand-deep shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-ink">قيمة المخزون</h3>
                    <InfoTooltip text="قيمة دفترية للمخزون المتتبَّع. الشراء لصنف متتبَّع يُرأسمَل هنا، والتكلفة تُخصَم عند البيع عبر COGS. راجع ACCOUNTING_RULES.md §9." />
                  </div>
                  <p className="text-[10px] text-ink/50 mt-0.5">
                    {inventoryValue === 0
                      ? "لا يوجد مخزون متتبَّع"
                      : "جزء من إجمالي الأصول"}
                  </p>
                </div>
              </div>
              <span
                className={`text-base font-black font-mono whitespace-nowrap ${
                  inventoryValue === 0 ? "text-ink/40" : "text-brand-deep"
                }`}
              >
                <AmountText amount={inventoryValue} hideCurrency />
              </span>
            </div>
            <Link
              href="/inventory"
              className="mt-3 flex items-center gap-1 text-xs font-bold text-brand-deep hover:underline"
            >
              إدارة المخزون
              <span className="text-[10px] opacity-60">←</span>
            </Link>
          </div>

          {/* ── 2. الأصول الرأسمالية والإهلاك ───────────────────────── */}
          {(capitalAdditions > 0 || depreciation > 0) && (
            <div className="bg-warn-soft/60 rounded-lg border border-warn/30 shadow-sm p-4 space-y-2">
              {capitalAdditions > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark className="h-4 w-4 text-warn-deep shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-ink">إضافات أصول رأسمالية</h3>
                        <InfoTooltip text="مشتريات ومصاريف رأسمالية (آلات، أثاث). لا تُخصم من الربح التشغيلي." />
                      </div>
                      <p className="text-[10px] text-ink/50 mt-0.5">لا تُخصم من الربح التشغيلي</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-warn-deep font-mono whitespace-nowrap">
                    <AmountText amount={capitalAdditions} hideCurrency />
                  </span>
                </div>
              )}
              {capitalAdditions > 0 && depreciation > 0 && (
                <div className="border-t border-warn/20 my-1" />
              )}
              {depreciation > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <TrendingDown className="h-4 w-4 text-brand shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-ink">إهلاك الفترة (غير نقدي)</h3>
                        <InfoTooltip text="إهلاك محسوب للأصول الرأسمالية النشطة. غير نقدي — لا يدخل cash_movement. راجع ACCOUNTING_RULES.md §10." />
                      </div>
                      <p className="text-[10px] text-ink/50 mt-0.5">الفرق بين الربح التشغيلي والنقدي</p>
                    </div>
                  </div>
                  <span className="text-sm font-black text-brand font-mono whitespace-nowrap">
                    <AmountText amount={depreciation} hideCurrency />
                  </span>
                </div>
              )}
              <Link
                href="/assets"
                className="flex items-center gap-1 text-xs font-bold text-warn-deep hover:underline pt-1"
              >
                إدارة الأصول الرأسمالية
                <span className="text-[10px] opacity-60">←</span>
              </Link>
            </div>
          )}

          {/* ── 3. أبرز المصاريف ──────────────────────────────────────── */}
          {stats && stats.topExpenses && stats.topExpenses.length > 0 && (
            <div className="bg-paper p-4 rounded-lg border border-hairline shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-ink/65 flex items-center gap-1.5">
                <ArrowDownRight className="h-4 w-4 text-ink-2" />
                أبرز المصاريف
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {stats.topExpenses.map((exp) => (
                  <div
                    key={exp.category}
                    className="p-3 bg-canvas rounded-lg border border-hairline flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-ink truncate">{exp.category}</p>
                      <p className="text-[10px] text-ink/45 mt-0.5">
                        {exp.count} حركات مالية
                      </p>
                    </div>
                    <span className="font-bold text-alert shrink-0">
                      <AmountText amount={exp.totalCents} hideCurrency />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 4. الربح مقابل السيولة ────────────────────────────────── */}
          {positionData && (
            <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 space-y-2">
              <div className="flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-brand" />
                <h3 className="text-xs font-bold text-ink">الربح مقابل السيولة</h3>
                <InfoTooltip text="النقد الموجود في صندوقك ليس كله ربحاً. إنه مزيج من: رأس المال الابتدائي، وصافي ما أضفته أو سحبته كمالك، وعربونات لم تُسلَّم بعد، وأخيراً ربحك المحتجز من العمل. راجع ACCOUNTING_RULES.md." />
              </div>
              <div className="space-y-1.5">
                <Row
                  label="رأس المال الذي بدأت به"
                  amount={positionData.opening}
                  colorClass="text-ink-3"
                />
                <Row
                  label="السحوبات الشخصية"
                  amount={positionData.ownerNet}
                  colorClass={
                    positionData.ownerNet >= 0 ? "text-brand" : "text-warn-deep"
                  }
                />
                <Row
                  label="عربون مسلَّم مقدَّماً"
                  amount={positionData.depositsHeld}
                  colorClass="text-warn-deep"
                />
                <Row
                  label={
                    <span className="flex items-center gap-1">
                      الربح المحتجز (بعد COGS، قبل الإهلاك)
                      <InfoTooltip text="الربح المحتجز = مبيعات نقدية − مشتريات − مصاريف − COGS. لا يشمل الإهلاك." />
                    </span>
                  }
                  amount={positionData.profit}
                  colorClass={
                    positionData.profit >= 0 ? "text-brand" : "text-alert"
                  }
                />
                {positionData.capitalAdditions > 0 && (
                  <Row
                    label={
                      <span className="flex items-center gap-1">
                        إضافات أصول رأسمالية
                        <InfoTooltip text="تُطرح من تركيبة السيولة للحفاظ على توازن الميزانية." />
                      </span>
                    }
                    amount={-positionData.capitalAdditions}
                    colorClass="text-warn-deep"
                  />
                )}
                {Math.abs(residual) > 0 && (
                  <Row
                    label="تسويات أخرى"
                    amount={residual}
                    colorClass="text-ink/40"
                  />
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-hairline">
                <span className="text-sm font-black text-brand whitespace-nowrap">
                  إجمالي الأصول المتاحة
                </span>
                <span className="text-lg font-black text-brand font-mono whitespace-nowrap">
                  <AmountText
                    amount={positionData.realCash}
                    hideCurrency
                    parenNegative
                  />
                </span>
              </div>

              {/* صافي قيمة المشروع — المجموع النهائي البارز */}
              <div className="flex items-center justify-between mt-1 pt-2 border-t-2 border-brand/30 bg-brand-soft -mx-4 px-4 py-3 rounded-b-lg">
                <span className="text-sm font-black text-brand-deep flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-brand shrink-0" />
                  صافي قيمة المشروع (السائل)
                  <InfoTooltip text="إجمالي الأصول − الالتزامات (العربون) = حقوق الملكية. هذا ما تملكه فعلاً من المشروع بعد خصم كل الالتزامات. راجع ACCOUNTING_RULES.md." />
                </span>
                <span className="text-xl font-black text-brand-deep font-mono whitespace-nowrap">
                  <AmountText
                    amount={positionData.realCash - positionData.depositsHeld}
                    hideCurrency
                    parenNegative
                  />
                </span>
              </div>
              {positionData.inventoryValue > 0 && (
                <div className="flex items-center justify-between text-[10px] text-ink/45">
                  <span className="whitespace-nowrap flex items-center gap-1">
                    ضمنها قيمة المخزون
                    <InfoTooltip text="الإجمالي يشمل النقد + قيمة المخزون المتتبَّع. راجع ACCOUNTING_RULES.md §9." />
                  </span>
                  <span className="font-mono whitespace-nowrap text-brand-deep">
                    <AmountText
                      amount={positionData.inventoryValue}
                      hideCurrency
                      parenNegative
                    />
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── 5. حالة الطلبات التشغيلية ─────────────────────────────── */}
          {stats && (
            <div className="bg-paper p-4 rounded-lg border border-hairline shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-brand" />
                  حالة الطلبات التشغيلية
                </h3>
                {pendingCount > 0 && (
                  <Link
                    href="/orders"
                    className="text-xs font-bold text-brand hover:underline"
                  >
                    {pendingCount} معلّق ←
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {(
                  [
                    "draft",
                    "sent",
                    "confirmed",
                    "delivered",
                    "cancelled",
                  ] as const
                ).map((status) => (
                  <div
                    key={status}
                    className={`p-3 rounded-lg border flex flex-col items-center justify-center ${
                      STATUS_COLORS[status] ?? ""
                    }`}
                  >
                    <p className="text-2xl font-black">
                      {stats.ordersByStatus[status] ?? 0}
                    </p>
                    <p className="text-xs font-bold mt-1">
                      {STATUS_LABELS[status] ?? status}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── مساعد: سطر في جدول تركيبة السيولة ────────────────────────────────────

function Row({
  label,
  amount,
  colorClass,
}: {
  label: React.ReactNode;
  amount: number;
  colorClass: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-ink/60 whitespace-nowrap">{label}</span>
      <span className={`font-mono font-bold whitespace-nowrap ${colorClass}`}>
        <AmountText amount={amount} hideCurrency parenNegative />
      </span>
    </div>
  );
}
