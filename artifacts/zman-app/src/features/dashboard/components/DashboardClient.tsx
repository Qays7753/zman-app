"use client";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
  ArrowDownRight,
  ArrowLeft,
  Calendar,
  ClipboardList,
  Clock,
  Plus,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Landmark,
  Wallet,
  AlertCircle,
  Settings,
  ArrowLeftRight,
  User,
  BarChart3,
  Package,
  Boxes,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { FilterChip } from "@/components/shared/FilterChip";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import {
  useFinancialSummary,
  useDashboardStats,
  useCashSummary,
  useAccountBalances,
  useAverageMonthlySpend,
  useMonthlyProfit,
  useFinancialPosition,
} from "../hooks";
import { useOpeningBalance } from "@/features/finance/hooks";
import { useInventoryValuation } from "@/features/inventory/hooks";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/status-colors";
import { LiquidityFlowPanel } from "./LiquidityFlowPanel";
import { MonthlyProfitPanel } from "./MonthlyProfitPanel";
import { InfoTooltip } from "@/components/shared/InfoTooltip";
import { FinancialAdvisor } from "./FinancialAdvisor";

/**
 * لوحة المقارنة المالية الموحّدة (مبيعات · مشتريات · مصاريف · الربح التشغيلي).
 * محسّنة للموبايل: أشرطة أفقية نسبية بطول متناسب مع أكبر قيمة، ليقرأ المالك
 * الأكبر من الأصغر بلمحة، وسطر ربح تشغيلي مميّز أسفلها.
 *
 * D3 fix (SA2): تسمية البطاقة صريحة الآن — «الربح التشغيلي (بعد الإهلاك)» —
 * لتمييزها عن «الربح النقدي المحتجز (قبل الإهلاك)» الذي يُعرض في لوحة الربح
 * مقابل السيولة. الفرق بين الرقمين = إهلاك الفترة المحسوب (غير نقدي). موثَّق
 * في ACCOUNTING_RULES.md §10.
 */
function FinanceComparePanel({
  actualSales,
  purchases,
  expenses,
  netProfit,
  ownerDraw,
  expectedRemaining,
}: {
  actualSales: number;
  purchases: number;
  expenses: number;
  netProfit: number;
  ownerDraw: number;
  expectedRemaining: number;
}) {
  const rows = [
    { label: "مبيعات", value: actualSales, barClass: "bg-info", textClass: "text-info", subtracted: false },
    { label: "مشتريات", value: purchases, barClass: "bg-amber-500", textClass: "text-amber-600", subtracted: true },
    { label: "مصاريف", value: expenses, barClass: "bg-orange-400", textClass: "text-amber-600", subtracted: true },
  ];
  const maxValue = Math.max(actualSales, purchases, expenses, 1);
  const isProfit = netProfit >= 0;
  const afterDraw = netProfit - ownerDraw;
  const isAfterDrawPositive = afterDraw >= 0;
  // الربح المستقبلي = الربح الحالي + ما سيُضاف عند تسليم الطلبات قيد التنفيذ
  // (سعر الطلب + أرباح إضافية − عربون)، بافتراض أن موادها اشتُريت مسبقاً.
  const futureProfit = netProfit + expectedRemaining;
  const isFutureProfit = futureProfit >= 0;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <BarChart3 className="h-4.5 w-4.5 text-info" />
          الربح التشغيلي
          <InfoTooltip text="الربح التشغيلي = مبيعات − مشتريات تشغيلية − مصاريف تشغيلية − إهلاك الفترة (غير نقدي). هذا الرقم يضم الإهلاك المحسوب للأصول الرأسمالية ضمن الفترة المختارة. خالف «الربح النقدي المحتجز» المعروض أسفل في لوحة الربح مقابل السيولة — الفرق بينهما = الإهلاك. راجع ACCOUNTING_RULES.md §10." />
        </h3>
        <span className="text-[10px] text-ink/40 whitespace-nowrap">الإجمالي لكل الفترات</span>
      </div>

      {/* الأشرطة النسبية — تباعد موحّد */}
      <div className="space-y-2.5">
        {rows.map((row) => {
          const pct = Math.round((row.value / maxValue) * 100);
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-2 whitespace-nowrap">{row.label}</span>
                <span className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${row.textClass}`}>
                  <AmountText amount={row.value} hideCurrency alwaysParen={row.subtracted} parenNegative />
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

      {/* الربح التشغيلي (بعد الإهلاك) — الرقم الأساسي. D3 fix: صياغة صريحة. */}
      <div className={`flex items-center justify-between gap-2 pt-3 border-t-2 ${isProfit ? "border-info/30" : "border-alert/30"}`}>
        <span className="text-sm font-bold text-ink flex items-center gap-1.5">
          {isProfit ? <TrendingUp className="h-4.5 w-4.5 text-info" /> : <TrendingDown className="h-4.5 w-4.5 text-alert" />}
          الربح التشغيلي (بعد الإهلاك)
          <InfoTooltip text="الربح التشغيلي (بعد الإهلاك) = مبيعات − مشتريات − مصاريف − إهلاك الفترة. يضم الإهلاك المحسوب للأصول الرأسمالية في الفترة المختارة (غير نقدي — لا يدخل cash_movement). يختلف عن «الربح النقدي المحتجز (قبل الإهلاك)» المعروض في لوحة الربح مقابل السيولة، والفرق = الإهلاك. راجع ACCOUNTING_RULES.md §10." />
        </span>
        <span className={`text-lg font-black font-mono whitespace-nowrap flex items-baseline gap-1 ${isProfit ? "text-info" : "text-alert"}`}>
          <AmountText amount={netProfit} hideCurrency parenNegative />
        </span>
      </div>

      {/* صافي الربح بعد سحوبات المالك — مؤشر ثانوي */}
      {ownerDraw > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-hairline">
          <span className="text-xs font-semibold text-ink/60 flex items-center gap-1">
            <User className="h-3.5 w-3.5 text-ink/40" />
            صافي الربح بعد سحوبات المالك
          </span>
          <span className={`text-sm font-bold font-mono whitespace-nowrap ${isAfterDrawPositive ? "text-info" : "text-alert"}`}>
            <AmountText amount={afterDraw} hideCurrency parenNegative />
          </span>
        </div>
      )}

      {/* الربح المتوقّع بعد تسليم الطلبات قيد التنفيذ */}
      {expectedRemaining > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-hairline">
          <span className="text-xs font-semibold text-ink/60 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5 text-info/50" />
            الربح المتوقّع بعد تسليم طلباتك
          </span>
          <span className={`text-sm font-bold font-mono whitespace-nowrap ${isFutureProfit ? "text-info" : "text-alert"}`}>
            <AmountText amount={futureProfit} hideCurrency parenNegative />
          </span>
        </div>
      )}
    </div>
  );
}

export function DashboardClient() {
  const [_isPending, _startTransition] = useTransition();

  // فترات التاريخ المتاحة.
  // "الكل" هو الافتراضي (يغطي كامل تاريخ المشروع). نستخدم بداية ثابتة بعيدة
  // (2020-01-01) لضمان شمول كل العمليات المسجّلة. تليه اختصارات أشهر أخيرة
  // ليكبس المالك شهراً معيناً بضغطة واحدة بدل التخصيص اليدوي.
  const presets = [
    {
      label: "الكل",
      getValue: () => ({ start: new Date("2020-01-01"), end: new Date() }),
    },
    ...[0, 1, 2].map((monthsAgo) => {
      const d = subMonths(new Date(), monthsAgo);
      return {
        // رقم الشهر/السنة (مثلاً "07/2026") بدل الاسم — أوضح وأخصر على الموبايل.
        label: format(d, "MM/yyyy"),
        getValue: () => ({ start: startOfMonth(d), end: endOfMonth(d) }),
      };
    }),
  ];

  const [selectedPresetIdx, setSelectedPresetIdx] = useState(0); // الافتراضي: الكل (الفترة الكاملة)
  const [customRange, setCustomRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  // حساب النطاق الفعلي
  const preset = presets[selectedPresetIdx] || presets[1] || presets[0]!;
  const range = customRange || preset.getValue();
  const startDateStr = format(range.start, "yyyy-MM-dd");
  const endDateStr = format(range.end, "yyyy-MM-dd");

  // استدعاء الاستعلامات التجميعية (§12)
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
  // الوضع المالي as-of نهاية الفترة المختارة — يقود بطاقات الرصيد/التركيبة
  // (يتوازن رياضياً فيختفي بند «تسويات أخرى» لأي فترة).
  const { data: position } = useFinancialPosition(endDateStr);
  // ربح كل شهر — مستقل عن الفلتر.
  const { data: monthlyProfit } = useMonthlyProfit(6);
  // ملخّص «هل أربح؟» = صورة إجمالية لكل الفترات مجمّعة (مستقلة عن الفلتر).
  const { data: summaryAllTime } = useFinancialSummary(
    "2020-01-01",
    format(new Date(), "yyyy-MM-dd"),
  );

  const handleRetryAll = () => {
    refetchSummary();
    refetchStats();
    refetchCash();
    refetchBalances();
  };

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
      setCustomRange({
        start: new Date(startVal),
        end: new Date(endVal),
      });
      setIsSelectorOpen(false);
    }
  };

  // نعرض شاشة الخطأ فقط عند فشل الجلب مع عدم وجود بيانات مخزّنة (persist).
  // لو استُعيدت بيانات من الكاش المحلي، نعرضها فوراً ونحدّث في الخلفية بصمت —
  // فلا تظهر شاشة "خطأ في الشبكة" على cold-start ما دام عندنا آخر بيانات.
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

  // حساب إجمالي النقد في الصندوق والبنك (التزاماً بـ §8.2)
  const totalCashCents = accountBalances
    ? accountBalances.filter((a) => a.type === "cash").reduce((acc, a) => acc + a.balanceCents, 0)
    : 0;

  const totalBankCents = accountBalances
    ? accountBalances.filter((a) => a.type === "bank").reduce((acc, accAccount) => acc + accAccount.balanceCents, 0)
    : 0;

  // قيم النقد as-of نهاية الفترة المختارة (من الوضع المالي المتوازن)، مع
  // fallback لأرصدة كل التاريخ ريثما يُحمَّل. على فلتر «الكل» = الرصيد الحالي.
  const asOfCashCents = position?.assets.cashCents ?? totalCashCents;
  const asOfBankCents = position?.assets.bankCents ?? totalBankCents;
  const asOfRealCashCents = position?.assets.totalCents ?? (totalCashCents + totalBankCents);
  const asOfDepositsHeldCents = position?.liabilities.depositsCents ?? (cashSummary?.depositsHeldCents ?? 0);

  // معالجة صافي حركة المالك لتحديد اللون والإشارة.
  const ownerNet = summary?.ownerNet ?? 0;

  return (
    <>
      <AppShellHeader
        title="لوحة القيادة"
        action={
          /* زر فلتر التاريخ في هيدر الموبايل — أيقونة بسيطة فقط */
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
        {/* شريط فلتر التاريخ للديسكتوب — موحّد داخل المحتوى */}
        <div className="hidden lg:block self-start">
          <SegmentedControl
            value={customRange ? "custom" : String(selectedPresetIdx)}
            onChange={(val) => {
              if (val === "custom") {
                setIsSelectorOpen(true);
              } else {
                handlePresetSelect(Number(val));
              }
            }}
            options={[
              ...presets.map((preset, i) => ({
                value: String(i),
                label: preset.label,
              })),
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
        {/* شبكة المؤشرات الماليّة 2x2 Stat Cards */}
        {isLoadingSummary || isLoadingCash ? (
          <div className="space-y-4">
            <div className="h-40 bg-paper rounded-lg border border-hairline animate-pulse" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-28 bg-paper rounded-lg border border-hairline animate-pulse"
                />
              ))}
            </div>
            {/* هيكل تحميل الملخص النقدي */}
            <div className="space-y-3 pt-2">
              <div className="h-5 w-32 bg-hairline-2 rounded animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-paper rounded-lg border border-hairline animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* لافتة الإعداد الأولي — تظهر فقط قبل إدخال الأرصدة الافتتاحية */}
            {openingBal === null && (
              <Link
                href="/finance?tab=opening"
                className="flex items-center justify-between gap-3 p-4 rounded-lg border border-warn/40 bg-warn-soft hover:bg-warn/10 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertCircle className="h-5 w-5 text-warn-deep shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">أكمل الإعداد الأولي للمشروع</p>
                    <p className="text-xs text-ink-2 truncate">يرجى تسجيل الأرصدة الافتتاحية ورأس المال لضبط الحسابات</p>
                  </div>
                </div>
                <Settings className="h-5 w-5 text-warn-deep shrink-0" />
              </Link>
            )}

            {/* ═══ نظرة سريعة — بطاقتان نظيفتان فقط ═══ */}
            <div className="grid grid-cols-2 gap-3">
              {/* إجمالي النقدية — مدموجة (صندوق + بنك) حتى نهاية الفترة */}
              <div className="bg-gradient-to-r from-info-soft to-info/5 p-3 rounded-lg border border-info/20 shadow-sm">
                <span className="text-[10px] font-bold text-ink/60 flex items-center gap-1 whitespace-nowrap">
                  <Wallet className="h-3.5 w-3.5 text-info shrink-0" />
                  النقد المتاح
                </span>
                <p className="text-lg font-black text-info mt-0.5 leading-tight whitespace-nowrap">
                  <AmountText amount={asOfRealCashCents} hideCurrency />
                </p>
                <p className="text-[9px] text-ink/40 leading-tight whitespace-nowrap">
                  صندوق: <AmountText amount={asOfCashCents} hideCurrency /> · بنك: <AmountText amount={asOfBankCents} hideCurrency />
                </p>
              </div>
              {/* عربونات في ذمتك — التزام (حتى نهاية الفترة) */}
              <div className="bg-warn-soft/30 p-3 rounded-lg border border-warn/15 shadow-sm">
                <span className="text-[10px] font-bold text-ink/60 flex items-center gap-1 whitespace-nowrap">
                  <AlertCircle className="h-3.5 w-3.5 text-warn-deep shrink-0" />
                  مجموع العربون لكل الطلبات
                </span>
                <p className="text-lg font-black text-warn-deep mt-0.5 leading-tight whitespace-nowrap">
                  <AmountText amount={asOfDepositsHeldCents} hideCurrency />
                </p>
              </div>
            </div>

            {/* ═══ حركة الكاش — إطار متوازن: بداية الفترة + داخل − خارج = نهايتها ═══ */}
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

            {/* ═══ هل أربح؟ — صورة إجمالية لكل الفترات (مستقلة عن الفلتر) ═══ */}
            {summaryAllTime && (
              <FinanceComparePanel
                actualSales={summaryAllTime.actualSales ?? 0}
                purchases={summaryAllTime.purchases ?? 0}
                expenses={summaryAllTime.expenses ?? 0}
                netProfit={summaryAllTime.netProfit ?? 0}
                ownerDraw={summaryAllTime.ownerDraw ?? 0}
                expectedRemaining={cashSummary?.expectedRemainingCents ?? 0}
              />
            )}

            {/* ═══ إضافات أصول رأسمالية — سطر منفصل (لا يُخصم من الربح التشغيلي) ═══ */}
            {/* Phase 2: بطاقة شفافية تُذكِّر المالك أن شراء الآلات/الأثاث لا يُسجَّل
                كخسارة في الشهر، بل يظهر هنا ويتطلب إهلاكاً مستقلاً (المرحلة 4).
                الرقم من computeOperatingPnl الموحَّدة، مطابق لما يظهر في الميزانية
                والتقارير.
                SA4 (Part C): رمز الألوان مُوحَّد مع نظام التوكنز — warn-soft/warn-deep
                بدل raw amber (SA3 cross-lane recommendation). */}
            {summaryAllTime && (summaryAllTime.capitalAdditionsCents ?? 0) > 0 && (
              <div className="bg-warn-soft/60 rounded-lg border border-warn/30 shadow-sm p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Landmark className="h-5 w-5 text-warn-deep shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-ink">إضافات أصول رأسمالية</h3>
                      <InfoTooltip text="مشتريات ومصاريف صُنِّفت كأصول رأسمالية (آلات، أثاث، معدات). لا تُخصم من الربح التشغيلي أعلاه — تُعرض هنا للشفافية وتستلزم إهلاكاً مستقلاً لاحقاً." />
                    </div>
                    <p className="text-[10px] text-ink/50 mt-0.5">لا تُخصم من الربح التشغيلي</p>
                  </div>
                </div>
                <span className="text-base font-black text-warn-deep font-mono whitespace-nowrap">
                  <AmountText amount={summaryAllTime.capitalAdditionsCents ?? 0} hideCurrency />
                </span>
              </div>
            )}

            {/* ═══ إهلاك الفترة (غير نقدي) — سطر شفافية لتفسير الفرق بين البطاقتين ═══ */}
            {/* D3 fix (SA2): بطاقة تُظهر قيمة الإهلاك المحسوبة للفترة المختارة. هذا
                هو الفرق الدقيق بين «الربح التشغيلي (بعد الإهلاك)» أعلاه و«الربح
                النقدي المحتجز (قبل الإهلاك)» أدناه. الرقم من computeOperatingPnl
                الموحَّدة (LOCKED-6 محفوظ — لا مسار منفصل). period-aware بعد D2 fix.
                SA4 (Part C): رمز الألوان مُوحَّد مع نظام التوكنز — info-soft/info
                بدل raw sky (SA3 cross-lane recommendation). */}
            {summaryAllTime && (summaryAllTime.monthlyDepreciationCents ?? 0) > 0 && (
              <div className="bg-info-soft/60 rounded-lg border border-info/30 shadow-sm p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingDown className="h-5 w-5 text-info shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-ink">إهلاك الفترة (غير نقدي)</h3>
                      <InfoTooltip text="إهلاك محسوب للأصول الرأسمالية النشطة ضمن الفترة المختارة (period-aware — يتغيّر بطول الفترة). هذا الرقم مُخصوم من «الربح التشغيلي (بعد الإهلاك)» أعلاه، لكنه غير نقدي فلا يدخل cash_movement ولا يُخصم من «الربح النقدي المحتجز (قبل الإهلاك)» أدناه. الفرق بين البطاقتين = هذا الرقم بالضبط. راجع ACCOUNTING_RULES.md §10." />
                    </div>
                    <p className="text-[10px] text-ink/50 mt-0.5">الفرق بين البطاقتين أعلاه وأسفل</p>
                  </div>
                </div>
                <span className="text-base font-black text-info font-mono whitespace-nowrap">
                  <AmountText amount={summaryAllTime.monthlyDepreciationCents ?? 0} hideCurrency />
                </span>
              </div>
            )}

            {/* ═══ قيمة المخزون — بطاقة ثابتة (تظهر دائماً، حتى عند الصفر) ═══ */}
            {/* D4 fix (SA3): بطاقة تُظهر قيمة المخزون المتتبَّع على الطريقة
                in qty × unit_cost − out qty × unit_cost من catalog_movement.
                هذا الرقم جزء من totalAssets (Cash + Inventory)، ويُعاد توازنه
                مع retainedProfitCents الذي يطرح COGS. الشراء لمخزون متتبَّع لا
                يخفض الربح التشغيلي (يُرأسمَل هنا)؛ التكلفة تُخصَم عند البيع عبر
                COGS (INV-23 / INV-24).
                SA4 (Part C): البطاقة الآن تظهر دائماً (حتى عند 0) — الـ zero-state
                يعرض «لا يوجد مخزون متتبَّع» بدل أن تختفي البطاقة. القيمة من
                summary.inventoryValueCents (مُضافة في SA4) لتعمل حتى دون انتظار
                position، مع fallback إلى position.assets.inventoryValueCents.
                رمز الألوان مُوحَّد — emerald-soft/emerald-deep (أصل إيجابي). */}
            {(() => {
              const inventoryValue =
                summaryAllTime?.inventoryValueCents
                ?? position?.assets.inventoryValueCents
                ?? 0;
              const isZero = inventoryValue === 0;
              return (
                <div className={`bg-emerald-soft/60 rounded-lg border border-emerald/30 shadow-sm p-4 flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-5 w-5 text-emerald-deep shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-ink">قيمة المخزون</h3>
                        <InfoTooltip text="قيمة دفترية للمخزون المتتبَّع من catalog_movement (الوارد × سعر الوحدة − المُصرف × سعر الوحدة). الشراء لصنف متتبَّع لا يُسجَّل كخسارة في الشهر — يُرأسمَل هنا كمخزون. التكلفة تُخصَم من الربح عند البيع عبر COGS (تعديل غير نقدي محسوب عند القراءة، مثل الإهلاك). راجع ACCOUNTING_RULES.md §9 (INV-23 / INV-24)." />
                      </div>
                      <p className="text-[10px] text-ink/50 mt-0.5">
                        {isZero ? "لا يوجد مخزون متتبَّع" : "جزء من إجمالي الأصول"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-base font-black font-mono whitespace-nowrap ${isZero ? "text-ink/40" : "text-emerald-deep"}`}>
                    <AmountText amount={inventoryValue} hideCurrency />
                  </span>
                </div>
              );
            })()}

            {/* ═══ القائمة الموحَّدة للمخزون المتتبَّع — إجابة سؤال «ما الذي يحتاج إعادة طلب؟» ═══ */}
            {/* SA4 (Part C): قائمة موحَّدة لكل صنف متتبَّع (اسم + رصيد + قيمة دفترية
                + علم «رصيد منخفض»). تستخدم getInventoryValuation الموسَّعة
                (bookValueCents + lowStock) — لا منطق جديد. الهدف: من لوحة القيادة
                وحدها، يستطيع المالك رؤية كل الأصناف المتتبَّعة دفعة واحدة بدل
                التنقّل في صفحة المكوّنات. الأصناف ذات الرصيد ≤ 0 تُعلَّم بالأحمر. */}
            <TrackedInventoryPanel />

            {/* ═══ الربح مقابل السيولة — تركيبة النقد as-of نهاية الفترة ═══ */}
            {/* تُحسب من الوضع المالي المتوازن، فالمجموع = النقد المتاح دائماً
                وبند «تسويات أخرى» يبقى صفراً لأي فترة تختارها.
                Phase 2: نطرح capitalAdditionsCents من التركيبة لأن retained
                أصبح تشغيلياً (الرأسمالي مستبعَد). Option A من CRITICAL-NOTE-2.
                Phase 3-revised (D4 fix): retainedProfitCents يطرح cogsCentsToDate
                (تعديل غير نقدي لمطابقة الإيراد بالتكلفة). totalAssets الآن = Cash +
                Inventory (inventoryValueCents). التركيبة موزونة تلقائياً مع الجديد:
                inventoryValue ضمن realCash (المجموع)، وCOGS ضمن profit (الطرح)،
                فيتبقى residual = 0 جبرياً. لشفافية أكبر، نُظهر inventoryValueCents
                كسطر ميمو أسفل المجموع (لا يدخل في composed — هو ضمن الإجمالي). */}
            {position && (() => {
              const realCash = position.assets.totalCents;
              const opening = position.equity.openingCashInEquityCents;
              const ownerNet = position.equity.injectionsCents - position.equity.drawingsCents;
              const depositsHeld = position.liabilities.depositsCents;
              const profit = position.equity.retainedProfitCents;
              const capitalAdditions = position.equity.capitalAdditionsCents ?? 0;
              const inventoryValue = position.assets.inventoryValueCents ?? 0;
              const composed = opening + ownerNet + depositsHeld + profit - capitalAdditions;
              const residual = realCash - composed;
              return (
                <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-4 w-4 text-info" />
                    <h3 className="text-xs font-bold text-ink">الربح مقابل السيولة</h3>
                    <InfoTooltip text="النقد الموجود في صندوقك ليس كله ربحاً. إنه مزيج من: رأس المال الذي بدأت به، وصافي ما أضفته أو سحبته كمالك، وعربونات لزبائن لم تُسلَّم طلباتهم بعد (نقد تتصرّف به بحرّية لكنه التزام حتى التسليم)، وأخيراً ربحك المحتجز من العمل. لهذا يكون النقد عادةً أكبر من الربح — وهذا وضع طبيعي. Phase 3-revised: الإجمالي يشمل قيمة المخزون المتتبَّع (إن وُجد)." />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/60 whitespace-nowrap">رأس المال الذي بدأت به</span>
                      <span className="font-mono font-bold text-ink-3 whitespace-nowrap"><AmountText amount={opening} hideCurrency parenNegative /></span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/60 whitespace-nowrap">السحوبات الشخصية</span>
                      <span className={`font-mono font-bold whitespace-nowrap ${ownerNet >= 0 ? "text-info" : "text-amber-600"}`}>
                        <AmountText amount={ownerNet} hideCurrency parenNegative />
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/60 whitespace-nowrap">عربون مسلّم مقدّماً</span>
                      <span className="font-mono font-bold text-warn-deep whitespace-nowrap"><AmountText amount={depositsHeld} hideCurrency parenNegative /></span>
                    </div>
                    {/* D3 fix (SA2): التسمية صريحة — «الربح المحتجز (قبل الإهلاك)».
                        D4 fix (SA3): retainedProfitCents يطرح الآن COGS التراكمي
                        (تعديل غير نقدي لمطابقة الإيراد بالتكلفة للأصناف المتتبَّعة).
                        لا يشمل الإهلاك المحسوب (غير النقدي) المعروض في بطاقة مستقلة أعلاه. */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink/60 whitespace-nowrap flex items-center gap-1">
                        الربح المحتجز (بعد COGS، قبل الإهلاك)
                        <InfoTooltip text="الربح المحتجز = مبيعات نقدية − مشتريات تشغيلية نقدية − مصاريف تشغيلية نقدية − تكلفة البضاعة المباعة (COGS، تعديل غير نقدي). لا يشمل الإهلاك (لأنه غير نقدي). يختلف عن «الربح التشغيلي (بعد الإهلاك)» المعروض في البطاقة العلوية، والفرق = إهلاك الفترة المعروض في بطاقة مستقلة. راجع ACCOUNTING_RULES.md §9 و§10." />
                      </span>
                      <span className={`font-mono font-bold whitespace-nowrap ${profit >= 0 ? "text-info" : "text-alert"}`}>
                        <AmountText amount={profit} hideCurrency parenNegative />
                      </span>
                    </div>
                    {capitalAdditions > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink/60 whitespace-nowrap flex items-center gap-1">
                          إضافات أصول رأسمالية
                          <InfoTooltip text="مشتريات ومصاريف رأسمالية (آلات، أثاث). لا تُخصم من الربح التشغيلي بل تُطرح هنا من تركيبة السيولة للحفاظ على توازن الميزانية." />
                        </span>
                        {/* SA4 (Part C): text-amber-700 → text-warn-deep (token-system
                            alignment with the dedicated capitalAdditions card above). */}
                        <span className="font-mono font-bold text-warn-deep whitespace-nowrap">
                          <AmountText amount={-capitalAdditions} hideCurrency parenNegative />
                        </span>
                      </div>
                    )}
                    {Math.abs(residual) > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink/40 whitespace-nowrap">تسويات أخرى</span>
                        <span className="font-mono font-bold text-ink/40 whitespace-nowrap"><AmountText amount={residual} hideCurrency parenNegative /></span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-hairline">
                    <span className="text-sm font-black text-info whitespace-nowrap">إجمالي الأصول المتاحة</span>
                    <span className="text-lg font-black text-info font-mono whitespace-nowrap"><AmountText amount={realCash} hideCurrency parenNegative /></span>
                  </div>
                  {/* D4 fix (SA3): سطر ميمو لشفافية قيمة المخزون ضمن الإجمالي.
                      realCash = Cash + Bank + Inventory. لاحظ أن inventoryValue
                      لا يُضاف لـ composed (هو ضمن الإجمالي بالفعل عبر retainedProfitCents
                      الذي يطرح cogsToDate). عرضه هنا للشفافية فقط.
                      SA4 (Part C): text-violet-700 → text-emerald-deep (token-system
                      alignment with the dedicated inventoryValue card above). */}
                  {inventoryValue > 0 && (
                    <div className="flex items-center justify-between text-[10px] text-ink/45">
                      <span className="whitespace-nowrap flex items-center gap-1">
                        ضمنها قيمة المخزون
                        <InfoTooltip text="إجمالي الأصول يشمل النقد في الصناديق والبنك بالإضافة إلى قيمة المخزون المتتبَّع (الوارد × سعر الوحدة − المُصرف × سعر الوحدة). هذا الرقم هو قيمة المخزون ضمن الإجمالي، وليس مبلغاً إضافياً. راجع ACCOUNTING_RULES.md §9." />
                      </span>
                      <span className="font-mono whitespace-nowrap text-emerald-deep"><AmountText amount={inventoryValue} hideCurrency parenNegative /></span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══ ربح كل شهر — مستقل عن الفلتر ═══ */}
            {monthlyProfit && monthlyProfit.length > 0 && (
              <MonthlyProfitPanel data={monthlyProfit} />
            )}

            {/* أبرز المصاريف */}
            {stats && stats.topExpenses && stats.topExpenses.length > 0 && (
              <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-ink/65 flex items-center gap-1.5">
                  <ArrowDownRight className="h-4.5 w-4.5 text-amber-600" />
                  أبرز المصاريف
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {stats.topExpenses.map((exp) => (
                    <div key={exp.category} className="p-3 bg-canvas rounded-lg border border-hairline flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{exp.category}</p>
                        <p className="text-[10px] text-ink/45 mt-0.5">{exp.count} حركات مالية</p>
                      </div>
                      <span className="font-bold text-alert shrink-0">
                        <AmountText amount={exp.totalCents} hideCurrency />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* حالة الطلبات التشغيلية */}
        {stats && (
          <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="text-base font-bold text-ink flex items-center gap-1.5">
                <ClipboardList className="h-4.5 w-4.5 text-info" />
                حالة الطلبات التشغيلية
              </h3>
              <span className="text-[10px] text-ink-3">ضمن الفترة المحددة</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {(["draft", "sent", "confirmed", "delivered", "cancelled"] as const).map((status) => (
                <div key={status} className={`p-3 rounded-lg border flex flex-col items-center justify-center ${STATUS_COLORS[status] ?? ""}`}>
                  <p className="text-2xl font-black">{stats.ordersByStatus[status] ?? 0}</p>
                  <p className="text-xs font-bold mt-1">{STATUS_LABELS[status] ?? status}</p>
                </div>
              ))}
            </div>
          </div>
        )}



      </div>

      {/* ═══ المستشار المالي — بمسافة سفلية تكفي كي لا يحجبه الزر العائم ═══ */}
      {summary && cashSummary && accountBalances && (
        <div className="px-0 pb-28">
          <FinancialAdvisor
            data={{
              realCash: asOfRealCashCents,
              opening: (openingBal?.cashCents ?? 0) + (openingBal?.bankCents ?? 0),
              ownerNet: (summary.ownerInject ?? 0) - (summary.ownerDraw ?? 0),
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
        </div>
      )}

      {/* منتقي التواريخ المتجاوب (Mobile Bottom Sheet / Desktop Dialog) */}
      <ResponsiveModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        title="تحديد الفترة الزمنية للتقرير"
      >
        <div className="space-y-6">
          {/* الاختيارات المجهزة سلفاً */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-ink/55">فترات سريعة:</span>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset, i) => (
                <FilterChip
                  key={preset.label}
                  label={preset.label}
                  isActive={selectedPresetIdx === i && !customRange}
                  onClick={() => handlePresetSelect(i)}
                  variant="rectangle"
                  className="w-full font-bold text-xs"
                />
              ))}
            </div>
          </div>

          <div className="border-t border-hairline my-4" />

          {/* التخصيص اليدوي */}
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <span className="text-xs font-bold text-ink/55">
               تحديد فترة مخصصة:
            </span>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold text-ink/65"
                  htmlFor="start-date-input"
                >
                  من تاريخ
                </label>
                <input
                  id="start-date-input"
                  name="start"
                  type="date"
                  required
                  defaultValue={
                    customRange ? format(customRange.start, "yyyy-MM-dd") : ""
                  }
                  className="flex h-11 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink"
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold text-ink/65"
                  htmlFor="end-date-input"
                >
                  إلى تاريخ
                </label>
                <input
                  id="end-date-input"
                  name="end"
                  type="date"
                  required
                  defaultValue={
                    customRange ? format(customRange.end, "yyyy-MM-dd") : ""
                  }
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

      {/* الزر العائم للهواتف المحمولة والديسكتوب (FAB) (§H3) */}
      <FloatingActionButton
        onClick={() => setIsFabOpen(true)}
        label="إضافة عملية جديدة"
      />

      {/* مودال العمليات السريعة للزر العائم (§H3) */}
      <ResponsiveModal
        isOpen={isFabOpen}
        onClose={() => setIsFabOpen(false)}
        title="إضافة عملية جديدة"
      >
        <div className="grid grid-cols-2 gap-3">
          {/* العمليات اليومية */}
          <Link
            href="/orders?new=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ClipboardList className="h-6 w-6 text-info" />
            <span className="text-xs font-bold text-ink">طلب جديد</span>
          </Link>
          <Link
            href="/finance?tab=sales&newSale=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ShoppingBag className="h-6 w-6 text-info" />
            <span className="text-xs font-bold text-ink">عملية بيع</span>
          </Link>
          <Link
            href="/finance?tab=expenses&newExpense=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ArrowDownRight className="h-6 w-6 text-alert" />
            <span className="text-xs font-bold text-ink">مصروف جديد</span>
          </Link>
          <Link
            href="/finance?tab=purchases&newPurchase=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ShoppingCart className="h-6 w-6 text-alert" />
            <span className="text-xs font-bold text-ink">تسجيل مشتريات</span>
          </Link>

          {/* فاصل بصري */}
          <div className="col-span-2 flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-hairline" />
            <span className="text-[10px] text-ink-3 font-bold">إجراءات مالية</span>
            <div className="flex-1 h-px bg-hairline" />
          </div>

          {/* الإجراءات المالية الجديدة */}
          <Link
            href="/finance?tab=accounts&newAccount=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <Landmark className="h-6 w-6 text-info" />
            <span className="text-xs font-bold text-ink">حساب جديد</span>
          </Link>
          <Link
            href="/finance?tab=accounts&newTransfer=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ArrowLeftRight className="h-6 w-6 text-info" />
            <span className="text-xs font-bold text-ink">تحويل بيني</span>
          </Link>
          <Link
            href="/finance?tab=owner&newOwnerTx=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <User className="h-6 w-6 text-alert" />
            <span className="text-xs font-bold text-ink">سحب / حقن مالك</span>
          </Link>
          <Link
            href="/finance?tab=opening"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <Settings className="h-6 w-6 text-warn-deep" />
            <span className="text-xs font-bold text-ink">أرصدة البداية</span>
          </Link>
        </div>
      </ResponsiveModal>
    </>
  );
}

/**
 * SA4 (Part C) — قائمة موحَّدة للمخزون المتتبَّع.
 *
 * يُجيب هذا المكوّن على سؤال المالك: «ما الذي يحتاج إعادة طلب؟» من لوحة القيادة
 * وحدها. قبل هذه البطاقة كان الرصيد مُوزَّعاً على بطاقات صفحة الكتالوج (واحدة
 * لكل صنف) — والمالك يضطر للتنقّل لمعرفة منخفض الرصيد.
 *
 * مصدر البيانات: `getInventoryValuation` الموسَّعة في `inventory/queries.ts`
 * (استعلام واحد لكل الأصناف المتتبَّعة). يُرجِي:
 *   - per-item: name, unit, balance, bookValueCents (نفس صيغة getFinancialPosition)
 *   - lowStock = (balance ≤ 0) — أصناف رصيدها صفري/سالب تُعلَّم بالأحمر.
 *
 * الحالات (state completeness):
 *   - isLoading → SkeletonList مدمج مع بطاقة فارغة (نفس ارتفاع البطاقة).
 *   - لا أصناف متتبَّعة → EmptyState موجز (الـ owner لم يفعّل التتبّع بعد).
 *   - أصناف متتبَّعة كلها برصيد 0 → تُعرَض كلها بعلم «رصيد منخفض».
 *   - بيانات محمَّلة → قائمة مختصرة (آخر 5 أصناف + رابط للمزيد في صفحة الكتالوج).
 *
 * تصميم: نُحتفظ بالقائمة مختصرة على الـ dashboard (آخر 5 + رابط) لتجنّب إغراق
 * اللوحة. صفحة الكتالوج تبقى مسار الإدارة الكاملة (تعديل/تسوية/حركات).
 */
function TrackedInventoryPanel() {
  const { data, isLoading } = useInventoryValuation();

  // لا نُظهر البطاقة إطلاقاً إن لم يكن هناك أصناف متتبَّعة مسجَّلة بعد (الـ empty
  // state الحقيقي = «لا أصناف متتبَّعة»). هذا يُميّز عن «أصناف متتبَّعة كلها 0»
  // الذي نُظهره (مع تحذير لكل صنف).
  if (!isLoading && data && data.totalCatalogs === 0) {
    return null;
  }

  // رتّب: الأصناف منخفضة الرصيد أولاً (الأكثر إلحاحاً للطلب)، ثم الباقي حسب
  // القيمة الدفترية تنازلياً (الأكبر قيمةً = الأكثر أهمية في الاهتمام).
  const sortedItems = [...(data?.items ?? [])].sort((a, b) => {
    if (a.lowStock !== b.lowStock) return a.lowStock ? -1 : 1;
    return (b.bookValueCents ?? 0) - (a.bookValueCents ?? 0);
  });

  const lowStockCount = sortedItems.filter((i) => i.lowStock).length;
  // نعرض أحدث 5 أصناف على الـ dashboard. الباقي يُترك لصفحة الكتالوج.
  const visibleItems = sortedItems.slice(0, 5);
  const hiddenCount = sortedItems.length - visibleItems.length;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <Boxes className="h-4.5 w-4.5 text-emerald-deep" />
          رصيد المخزون المتتبَّع
          <InfoTooltip text="كل صنف متتبَّع في الكتالوج مع رصيده الحالي وقيمته الدفترية. الرصيد = الوارد − المُصرف من catalog_movement. القيمة الدفترية = Σ (سعر الوحدة × الكمية) لكل حركة — مطابقة لما يظهر في الميزانية. الأصناف ذات الرصيد الصفري أو السالب تُعلَّم بالأحمر (تستحق إعادة الطلب)." />
        </h3>
        {lowStockCount > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-alert-soft text-alert border border-alert/30 flex items-center gap-1 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            {lowStockCount} رصيد منخفض
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-10 bg-canvas rounded-md animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-hairline">
            {visibleItems.map((item) => {
              const isNegative = item.balance < 0;
              return (
                <li
                  key={item.catalogComponentId}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-ink truncate">
                        {item.name}
                      </span>
                      {item.lowStock && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-alert-soft text-alert border border-alert/20 flex items-center gap-0.5 shrink-0">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          {isNegative ? "رصيد سالب" : "رصيد صفري"}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-ink/45 mt-0.5">
                      القيمة الدفترية:{" "}
                      <span className="font-mono text-ink/60">
                        <AmountText amount={item.bookValueCents} hideCurrency />
                      </span>
                    </p>
                  </div>
                  <span
                    className={`text-sm font-black font-mono whitespace-nowrap shrink-0 ${
                      item.lowStock ? "text-alert" : "text-ink"
                    }`}
                    dir="ltr"
                  >
                    {item.balance} {item.unit}
                  </span>
                </li>
              );
            })}
          </ul>
          {hiddenCount > 0 && (
            <Link
              href="/catalog"
              className="block text-center text-xs font-bold text-info hover:text-info/80 transition-colors pt-1"
            >
              عرض كل الأصناف المتتبَّعة ({hiddenCount} إضافي) ←
            </Link>
          )}
        </>
      )}
    </div>
  );
}
