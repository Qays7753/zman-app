"use client";

/**
 * DashboardClient — لوحة القيادة المُعاد هيكلتها (Round 3 UX refactor).
 *
 * البنية الهرمية الثلاثية:
 *   Layer 1 (دائمة):  بطاقة الصحة · FinanceComparePanel · LiquidityFlowPanel · MonthlyProfitPanel
 *   Layer 2 (قابلة للطي): DetailsLayer — تفاصيل مالية عميقة
 *   Layer 3 (مزالة): النصوص الوصفية الطويلة · القوائم المكررة
 *
 * القيمة الافتراضية للفلتر: «منذ البداية» (كل الفترات) — Round 6 UX.
 * لم يُلمَس أي منطق محاسبي أو hook أو قاعدة بيانات.
 */

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  Calendar,
  ClipboardList,
  Clock,
  Landmark,
  MessageSquare,
  Plus,
  Settings,
  ShoppingBag,
  ShoppingCart,
  User,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { GlobalSearch } from "./GlobalSearch";
import { useState } from "react";

import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { ErrorState } from "@/components/shared/ErrorState";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { FilterChip } from "@/components/shared/FilterChip";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SegmentedControl } from "@/components/shared/SegmentedControl";

import {
  useAccountBalances,
  useAverageMonthlySpend,
  useCashSummary,
  useDashboardStats,
  useFinancialPosition,
  useFinancialSummary,
  useMonthlyProfit,
} from "../hooks";
import { useOpeningBalance } from "@/features/finance/hooks";
import { useInventoryValuation } from "@/features/inventory/hooks";
import { useCapitalAssets } from "@/features/depreciation/hooks";

import { DetailsLayer } from "./DetailsLayer";
import { FinanceComparePanel } from "./FinanceComparePanel";
import { FinancialAdvisor } from "./FinancialAdvisor";
import { LiquidityFlowPanel } from "./LiquidityFlowPanel";
import { MonthlyProfitPanel } from "./MonthlyProfitPanel";
import { SmartAlertsBar } from "./SmartAlertsBar";
import { UpcomingDeliveriesCard } from "./UpcomingDeliveriesCard";

// ─────────────────────────────────────────────────────────────────────────────

export function DashboardClient() {

  // ── فترات التاريخ ─────────────────────────────────────────────────────────
  const presets = [
    {
      label: "منذ البداية",
      getValue: () => ({ start: new Date("2020-01-01"), end: new Date() }),
    },
    ...[0, 1, 2].map((monthsAgo) => {
      const d = subMonths(new Date(), monthsAgo);
      return {
        label: format(d, "MM/yyyy"),
        getValue: () => ({ start: startOfMonth(d), end: endOfMonth(d) }),
      };
    }),
  ];

  // الافتراضي: «منذ البداية» (index 0) — Round 6 UX: الورش الصغيرة تحتاج الصورة الكاملة
  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0);
  const [customRange, setCustomRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  const preset = presets[selectedPresetIdx] ?? presets[1]!;
  const range = customRange ?? preset.getValue();
  const startDateStr = format(range.start, "yyyy-MM-dd");
  const endDateStr = format(range.end, "yyyy-MM-dd");

  // ── استعلامات البيانات ────────────────────────────────────────────────────
  const {
    data: summary,
    isLoading: isLoadingSummary,
    isError: isErrorSummary,
    refetch: refetchSummary,
  } = useFinancialSummary(startDateStr, endDateStr);

  const {
    data: stats,
    refetch: refetchStats,
  } = useDashboardStats(startDateStr, endDateStr);

  const {
    data: cashSummary,
    isLoading: isLoadingCash,
    isError: isErrorCash,
    refetch: refetchCash,
  } = useCashSummary();

  const {
    data: accountBalances,
    refetch: refetchBalances,
  } = useAccountBalances();

  const { data: openingBal } = useOpeningBalance();
  const { data: avgMonthlySpend } = useAverageMonthlySpend(3);
  const { data: position } = useFinancialPosition(endDateStr);
  const { data: monthlyProfit } = useMonthlyProfit(6);

  // summaryAllTime — لبطاقات DetailsLayer (مستقلة عن الفلتر)
  const { data: summaryAllTime } = useFinancialSummary(
    "2020-01-01",
    format(new Date(), "yyyy-MM-dd"),
  );

  // بيانات المخزون للتنبيهات الذكية
  const { data: inventoryData } = useInventoryValuation();

  // الأصول الرأسمالية — لحساب صافي القيمة الدفترية as-of endDate
  const { data: capitalAssetsData } = useCapitalAssets(endDateStr);

  // ── معالجة الأخطاء ────────────────────────────────────────────────────────
  const handleRetryAll = () => {
    refetchSummary();
    refetchStats();
    refetchCash();
    refetchBalances();
  };

  const hasNoData = !summary && !cashSummary;
  if ((isErrorSummary || isErrorCash) && hasNoData) {
    return (
      <>
        <AppShellHeader title="لوحة القيادة" />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState
            message="حدث خطأ أثناء تحميل بيانات لوحة القيادة. يرجى التحقق من اتصالك وحاول مجدداً."
            onRetry={handleRetryAll}
          />
        </div>
      </>
    );
  }

  // ── قيم مُشتقَّة ──────────────────────────────────────────────────────────
  const totalCashCents = accountBalances
    ? accountBalances
        .filter((a) => a.type === "cash")
        .reduce((acc, a) => acc + a.balanceCents, 0)
    : 0;
  const totalBankCents = accountBalances
    ? accountBalances
        .filter((a) => a.type === "bank")
        .reduce((acc, a) => acc + a.balanceCents, 0)
    : 0;

  const asOfCashCents = position?.assets.cashCents ?? totalCashCents;
  const asOfBankCents = position?.assets.bankCents ?? totalBankCents;
  const asOfRealCashCents =
    position?.assets.totalCents ?? totalCashCents + totalBankCents;
  const asOfDepositsHeldCents =
    position?.liabilities.depositsCents ??
    (cashSummary?.depositsHeldCents ?? 0);

  // التنبيهات الذكية
  const lowStockCount =
    inventoryData?.items.filter((i) => i.lowStock).length ?? 0;
  const pendingOrdersCount =
    (stats?.ordersByStatus["sent"] ?? 0) +
    (stats?.ordersByStatus["confirmed"] ?? 0);

  // صافي القيمة الدفترية للأصول الرأسمالية as-of endDate
  const capitalAssetsNetValueCents =
    capitalAssetsData?.reduce((sum, a) => sum + a.netBookValueCents, 0) ?? 0;

  // ── معالجة الفلتر ─────────────────────────────────────────────────────────
  const handlePresetSelect = (idx: number) => {
    setSelectedPresetIdx(idx);
    setCustomRange(null);
    setIsSelectorOpen(false);
  };

  const handleCustomSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const startVal = data.get("start") as string;
    const endVal = data.get("end") as string;
    if (startVal && endVal) {
      setCustomRange({ start: new Date(startVal), end: new Date(endVal) });
      setIsSelectorOpen(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <AppShellHeader
        title="لوحة القيادة"
        action={
          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className="lg:hidden h-10 min-h-[44px] px-3 bg-canvas border border-hairline text-ink rounded-md flex items-center gap-1.5 text-xs font-semibold"
          >
            <Calendar className="h-4 w-4 text-info flex-shrink-0" />
            <span className="max-w-[90px] truncate">
              {customRange ? "فترة مخصصة" : (presets[selectedPresetIdx]?.label ?? "")}
            </span>
          </button>
        }
      />

      <div className="space-y-5 pb-28">
        {/* فلتر الديسكتوب */}
        <div className="hidden lg:block self-start">
          <SegmentedControl
            value={customRange ? "custom" : String(selectedPresetIdx)}
            onChange={(val) => {
              if (val === "custom") setIsSelectorOpen(true);
              else handlePresetSelect(Number(val));
            }}
            options={[
              ...presets.map((p, i) => ({ value: String(i), label: p.label })),
              {
                value: "custom",
                label: customRange
                  ? `${format(customRange.start, "MM/dd")} - ${format(customRange.end, "MM/dd")}`
                  : "تخصيص",
                icon: <Calendar className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>

        {/* هيكل التحميل */}
        {isLoadingSummary || isLoadingCash ? (
          <div className="space-y-4">
            <div className="h-32 bg-paper rounded-xl border border-hairline animate-pulse" />
            <div className="h-40 bg-paper rounded-lg border border-hairline animate-pulse" />
            <div className="h-32 bg-paper rounded-lg border border-hairline animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* البحث الشامل */}
            <GlobalSearch />

            {/* إعداد أولي — البنود الأربعة */}
            {(!openingBal || !openingBal.isLocked) && (
              <Link
                href="/settings/opening-balance"
                className="flex flex-col gap-2.5 p-4 rounded-lg border border-warn/40 bg-warn-soft hover:bg-warn/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AlertCircle className="h-5 w-5 text-warn-deep shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">أكمل الإعداد الأولي للمشروع</p>
                      <p className="text-xs text-ink-2 truncate">اضبط الميزان الافتتاحي واقفل الأرقام لتثبيت الدفتر المحاسبي</p>
                    </div>
                  </div>
                  <Settings className="h-5 w-5 text-warn-deep shrink-0" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-warn/20 text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    {openingBal && openingBal.cashCents > 0 ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-alert font-bold">✗</span>
                    )}
                    <span className="text-ink-2">رصيد الصندوق</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    {openingBal && openingBal.bankCents > 0 ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-alert font-bold">✗</span>
                    )}
                    <span className="text-ink-2">رصيد البنك</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    {openingBal && openingBal.capitalCents > 0 ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-alert font-bold">✗</span>
                    )}
                    <span className="text-ink-2">رأس المال</span>
                  </div>

                  <div className="flex items-center gap-1.5 font-medium">
                    {openingBal?.isLocked ? (
                      <span className="text-emerald-600 font-bold">✓</span>
                    ) : (
                      <span className="text-alert font-bold">✗</span>
                    )}
                    <span className="text-ink-2">تأكيد القفل</span>
                  </div>
                </div>
              </Link>
            )}

            {/* ═══ Layer 1: الطبقة الأولى — دائماً ظاهرة ═══ */}

            {/* وصول سريع — كل الحركات + الملاحظات (Issue #10) */}
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/activities"
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm hover:bg-canvas transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-info shrink-0" />
                  <span className="font-bold text-ink">كل الحركات</span>
                </span>
                <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
              </Link>
              <Link
                href="/snippets"
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-hairline bg-paper px-3 py-2 text-sm hover:bg-canvas transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-info shrink-0" />
                  <span className="font-bold text-ink">الملاحظات</span>
                </span>
                <ArrowLeft className="h-3 w-3 opacity-50 shrink-0" />
              </Link>
            </div>

            {/* التنبيهات الذكية */}
            <SmartAlertsBar
              lowStockCount={lowStockCount}
              pendingOrdersCount={pendingOrdersCount}
              isLowCash={asOfRealCashCents < 50000}
            />

            {/* بطاقة الصحة الكبيرة */}
            <HealthCard
              asOfRealCashCents={asOfRealCashCents}
              asOfCashCents={asOfCashCents}
              asOfBankCents={asOfBankCents}
              asOfDepositsHeldCents={asOfDepositsHeldCents}
              netProfit={summary?.netProfit ?? 0}
              inventoryValueCents={summary?.inventoryValueCents ?? 0}
            />

            {/* طلبات تحتاج تسليم قريباً (Issue #9) */}
            <UpcomingDeliveriesCard />

            {/* الربح التشغيلي — أشرطة مقارنة للفترة المختارة */}
            {summary && (
              <FinanceComparePanel
                actualSales={summary.actualSales ?? 0}
                cogsCents={summary.cogsCents ?? 0}
                operatingExpenses={summary.operatingExpensesCents ?? 0}
                operatingPurchases={summary.operatingPurchasesCents ?? 0}
                depreciation={summary.monthlyDepreciationCents ?? 0}
                netProfit={summary.netProfit ?? 0}
                ownerDraw={summary.ownerDraw ?? 0}
                expectedRemaining={cashSummary?.expectedRemainingCents ?? 0}
                nonOperatingPurchases={
                  Math.max((summary.purchases ?? 0) - (summary.operatingPurchasesCents ?? 0), 0)
                }
              />
            )}

            {/* حركة الكاش */}
            {summary && (
              <LiquidityFlowPanel
                actualSales={summary.actualSales ?? 0}
                deposits={summary.deposits ?? 0}
                ownerInject={summary.ownerInject ?? 0}
                purchases={summary.purchases ?? 0}
                expenses={summary.expenses ?? 0}
                ownerDraw={summary.ownerDraw ?? 0}
              />
            )}

            {/* ربح كل شهر */}
            {monthlyProfit && monthlyProfit.length > 0 && (
              <MonthlyProfitPanel data={monthlyProfit} />
            )}

            {/* ═══ Layer 2: التفاصيل المالية (قابلة للطي) ═══ */}
            <DetailsLayer
              summaryAllTime={summaryAllTime}
              position={position}
              stats={stats}
              netProfit={summary?.netProfit ?? 0}
              ownerDraw={summary?.ownerDraw ?? 0}
              capitalAssetsNetValueCents={capitalAssetsNetValueCents}
            />

            {/* المستشار المالي */}
            {summary && cashSummary && accountBalances && (
              <FinancialAdvisor
                data={{
                  realCash: asOfRealCashCents,
                  opening:
                    (openingBal?.cashCents ?? 0) + (openingBal?.bankCents ?? 0),
                  ownerNet:
                    (summary.ownerInject ?? 0) - (summary.ownerDraw ?? 0),
                  ownerInject: summary.ownerInject ?? 0,
                  ownerDraw: summary.ownerDraw ?? 0,
                  depositsHeld: asOfDepositsHeldCents,
                  expectedRemaining: cashSummary.expectedRemainingCents,
                  netProfit: summary.netProfit ?? 0,
                  actualSales: summary.actualSales ?? 0,
                  purchases: summary.purchases ?? 0,
                  expenses: summary.expenses ?? 0,
                  avgMonthlySpend: avgMonthlySpend ?? 0,
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* منتقي التواريخ */}
      <ResponsiveModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        title="تحديد الفترة الزمنية للتقرير"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-xs font-bold text-ink/55">فترات سريعة:</span>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((p, i) => (
                <FilterChip
                  key={p.label}
                  label={p.label}
                  isActive={selectedPresetIdx === i && !customRange}
                  onClick={() => handlePresetSelect(i)}
                  variant="rectangle"
                  className="w-full font-bold text-xs"
                />
              ))}
            </div>
          </div>
          <div className="border-t border-hairline" />
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <span className="text-xs font-bold text-ink/55">تحديد فترة مخصصة:</span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-ink/65" htmlFor="start-date-input">
                  من تاريخ
                </label>
                <input
                  id="start-date-input"
                  name="start"
                  type="date"
                  required
                  defaultValue={customRange ? format(customRange.start, "yyyy-MM-dd") : ""}
                  className="flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-ink/65" htmlFor="end-date-input">
                  إلى تاريخ
                </label>
                <input
                  id="end-date-input"
                  name="end"
                  type="date"
                  required
                  defaultValue={customRange ? format(customRange.end, "yyyy-MM-dd") : ""}
                  className="flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full h-11 bg-info text-paper rounded-md text-sm font-bold shadow-sm hover:bg-info/90 active:scale-95 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2"
            >
              تطبيق التواريخ المخصصة
            </button>
          </form>
        </div>
      </ResponsiveModal>

      {/* الزر العائم */}
      <FloatingActionButton
        onClick={() => setIsFabOpen(true)}
        label="إضافة عملية جديدة"
      />

      {/* مودال العمليات السريعة */}
      <ResponsiveModal
        isOpen={isFabOpen}
        onClose={() => setIsFabOpen(false)}
        title="إضافة عملية جديدة"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex items-center gap-2 pb-1">
            <div className="flex-1 h-px bg-hairline" />
            <span className="text-[11px] text-ink font-bold">عملياتك اليومية</span>
            <div className="flex-1 h-px bg-hairline" />
          </div>

          <QuickLink href="/orders?new=true" icon={<ClipboardList className="h-6 w-6 text-info" />} label="طلب جديد" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=sales&newSale=true" icon={<ShoppingBag className="h-6 w-6 text-info" />} label="عملية بيع" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=payments&newExpense=true" icon={<ArrowDownRight className="h-6 w-6 text-alert" />} label="مصروف جديد" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=payments&newPurchase=true" icon={<ShoppingCart className="h-6 w-6 text-alert" />} label="تسجيل مشتريات" onClick={() => setIsFabOpen(false)} />

          <div className="col-span-2 flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-hairline" />
            <span className="text-[10px] text-ink-3 font-bold">إجراءات مالية</span>
            <div className="flex-1 h-px bg-hairline" />
          </div>

          <QuickLink href="/finance?tab=accounts&newAccount=true" icon={<Landmark className="h-6 w-6 text-info" />} label="حساب جديد" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=accounts&newTransfer=true" icon={<ArrowLeftRight className="h-6 w-6 text-info" />} label="تحويل بيني" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=owner&newOwnerTx=true" icon={<User className="h-6 w-6 text-alert" />} label="سحب / حقن مالك" onClick={() => setIsFabOpen(false)} />
          <QuickLink href="/finance?tab=opening" icon={<Settings className="h-6 w-6 text-warn-deep" />} label="أرصدة البداية" onClick={() => setIsFabOpen(false)} />
        </div>
      </ResponsiveModal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// بطاقة الصحة المالية — تُجيب على «كيف حالي الآن؟» في 3 ثوانٍ
// ─────────────────────────────────────────────────────────────────────────────

function HealthCard({
  asOfRealCashCents,
  asOfCashCents,
  asOfBankCents,
  asOfDepositsHeldCents,
  netProfit,
  inventoryValueCents,
}: {
  asOfRealCashCents: number;
  asOfCashCents: number;
  asOfBankCents: number;
  asOfDepositsHeldCents: number;
  netProfit: number;
  inventoryValueCents: number;
}) {
  const isProfit = netProfit >= 0;

  return (
    <div className="rounded-xl border border-hairline shadow-sm overflow-hidden">
      {/* الصف العلوي: نقد + ربح */}
      <div className="grid grid-cols-2 divide-x divide-x-reverse divide-hairline">
        {/* النقد المتاح */}
        <div className="bg-gradient-to-br from-info-soft to-info/5 p-4">
          <span className="text-[10px] font-bold text-ink/60 flex items-center gap-1 whitespace-nowrap mb-1">
            <Wallet className="h-3.5 w-3.5 text-info shrink-0" />
            النقد المتاح
          </span>
          <p className="text-xl font-black text-info leading-tight">
            <AmountText amount={asOfRealCashCents} hideCurrency />
          </p>
          <p className="text-[10px] text-ink/40 mt-1 leading-tight">
            صندوق: <AmountText amount={asOfCashCents} hideCurrency />
            <span className="mx-1">·</span>
            بنك: <AmountText amount={asOfBankCents} hideCurrency />
          </p>
        </div>

        {/* الربح التشغيلي للفترة */}
        <div
          className={`p-4 ${
            isProfit
              ? "bg-gradient-to-br from-emerald-soft/60 to-emerald/5"
              : "bg-gradient-to-br from-alert-soft/60 to-alert/5"
          }`}
        >
          <span
            className={`text-[10px] font-bold flex items-center gap-1 whitespace-nowrap mb-1 ${
              isProfit ? "text-emerald-deep/70" : "text-alert/70"
            }`}
          >
            {isProfit ? "📈" : "📉"}
            ربح الفترة
          </span>
          <p
            className={`text-xl font-black leading-tight ${
              isProfit ? "text-emerald-deep" : "text-alert"
            }`}
          >
            <AmountText amount={netProfit} hideCurrency parenNegative />
          </p>
          <p
            className={`text-[10px] mt-1 font-semibold ${
              isProfit ? "text-emerald-deep/50" : "text-alert/50"
            }`}
          >
            {isProfit ? "مربح ✓" : "خسارة الفترة"}
          </p>
        </div>
      </div>

      {/* الصف الثاني: قيمة المخزون — رابط لشاشة المخزون */}
      {inventoryValueCents > 0 && (
        <Link
          href="/inventory"
          className="bg-info/5 border-t border-info/10 px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-info/10 hover:underline transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-semibold text-ink/55 flex items-center gap-1 whitespace-nowrap">
            <ShoppingBag className="h-3 w-3 text-info/70 shrink-0" />
            قيمة مخزونك
          </span>
          <span className="text-xs font-black text-info/80 font-mono whitespace-nowrap">
            <AmountText amount={inventoryValueCents} hideCurrency />
          </span>
        </Link>
      )}

      {/* الصف الثالث: العربون — رابط لشاشة الطلبات */}
      {asOfDepositsHeldCents > 0 && (
        <Link
          href="/orders"
          className="bg-warn-soft/30 border-t border-warn/15 px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-warn-soft/50 hover:underline transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-semibold text-ink/55 flex items-center gap-1 whitespace-nowrap">
            <AlertCircle className="h-3 w-3 text-warn-deep shrink-0" />
            عربون مستحق التسليم
          </span>
          <span className="text-xs font-black text-warn-deep font-mono whitespace-nowrap">
            <AmountText amount={asOfDepositsHeldCents} hideCurrency />
          </span>
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickLink — عنصر في مودال العمليات السريعة
// ─────────────────────────────────────────────────────────────────────────────

function QuickLink({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 active:scale-95 transition-all gap-2 min-h-[80px]"
    >
      {icon}
      <span className="text-xs font-bold text-ink text-center">{label}</span>
    </Link>
  );
}
