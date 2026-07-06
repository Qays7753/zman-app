"use client";

import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
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
} from "lucide-react";
import dynamic from "next/dynamic";
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
  useFinancialTrendData,
  useRecentActivities,
  useDashboardStats,
  useCashSummary,
  useAccountBalances,
} from "../hooks";
import { useOpeningBalance } from "@/features/finance/hooks";

/**
 * اتجاه سلسلة قيم عبر الفترة: نقارن مجموع النصف الأول بالنصف الثاني.
 * لا يحتاج بيانات فترة سابقة — يعكس الاتجاه داخل الفترة نفسها بصدق.
 */
function seriesDirection(data: number[]): "up" | "down" | "flat" {
  if (!data || data.length < 2) return "flat";
  const mid = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, mid).reduce((a, b) => a + b, 0);
  const secondHalf = data.slice(mid).reduce((a, b) => a + b, 0);
  if (secondHalf > firstHalf) return "up";
  if (secondHalf < firstHalf) return "down";
  return "flat";
}

/**
 * سهم اتجاه بسيط: ▲ أخضر (صاعد) / ▼ أحمر (هابط) / — رمادي (ثابت).
 * `goodWhenUp=false` يعكس المعنى (للمصاريف: الصعود سيّئ فيُلوَّن أحمر).
 */
function TrendArrow({
  data,
  goodWhenUp = true,
}: {
  data: number[];
  goodWhenUp?: boolean;
}) {
  const dir = seriesDirection(data);
  if (dir === "flat") {
    return <span className="text-[10px] text-ink-3 font-bold shrink-0">—</span>;
  }
  const isGood = dir === "up" ? goodWhenUp : !goodWhenUp;
  const color = isGood ? "text-emerald-deep" : "text-alert";
  const Icon = dir === "up" ? TrendingUp : TrendingDown;
  return <Icon className={`h-4 w-4 shrink-0 ${color}`} />;
}

export function DashboardClient() {
  const [_isPending, _startTransition] = useTransition();

  // أشكال التوهّج العشر — أسماء كلاسات صريحة (مكتوبة حرفياً) ليولّدها Tailwind v4.
  // بناء الاسم ديناميكياً (`animate-delivery-glow-${n}`) لا يُولَّد لأن Tailwind
  // لا يرى الأسماء المركّبة أثناء البناء.
  const glowClasses = [
    "animate-delivery-glow-1",
    "animate-delivery-glow-2",
    "animate-delivery-glow-3",
    "animate-delivery-glow-4",
    "animate-delivery-glow-5",
    "animate-delivery-glow-6",
    "animate-delivery-glow-7",
    "animate-delivery-glow-8",
    "animate-delivery-glow-9",
    "animate-delivery-glow-10",
  ];
  // نبدأ بقيمة ثابتة (0) لتفادي اختلاف SSR، ثم نختار عشوائياً بعد الـ mount.
  const [glowIndex, setGlowIndex] = useState(0);
  useEffect(() => {
    setGlowIndex(Math.floor(Math.random() * glowClasses.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowClass = glowClasses[glowIndex];

  // فترات التاريخ المتاحة
  const presets = [
    {
      label: "آخر 7 أيام",
      getValue: () => ({ start: subDays(new Date(), 6), end: new Date() }),
    },
    {
      label: "آخر 30 يوم",
      getValue: () => ({ start: subDays(new Date(), 29), end: new Date() }),
    },
    {
      label: "الشهر الحالي",
      getValue: () => ({
        start: startOfMonth(new Date()),
        end: endOfMonth(new Date()),
      }),
    },
  ];

  const [selectedPresetIdx, setSelectedPresetIdx] = useState(1); // التقصير: آخر 30 يوم
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
    data: activities,
    isLoading: isLoadingActivities,
    isError: isErrorActivities,
    refetch: refetchActivities,
  } = useRecentActivities();
  const {
    data: trendData,
    isLoading: isLoadingTrend,
    isError: isErrorTrend,
    refetch: refetchTrend,
  } = useFinancialTrendData(startDateStr, endDateStr);
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

  const handleRetryAll = () => {
    refetchSummary();
    refetchActivities();
    refetchTrend();
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

  if (isErrorSummary || isErrorActivities || isErrorTrend || isErrorCash) {
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
    ? accountBalances.filter((a) => a.type === "cash" && !a.isArchived).reduce((acc, a) => acc + a.balanceCents, 0)
    : 0;

  const totalBankCents = accountBalances
    ? accountBalances.filter((a) => a.type === "bank" && !a.isArchived).reduce((acc, a) => acc + a.balanceCents, 0)
    : 0;

  // معالجة صافي الأرباح لتحديد اللون والإشارة للتسهيل على فاقدي التمييز اللوني (§14.3)
  const net = summary?.netProfit ?? 0;
  const isProfit = net >= 0;
  const netSign = isProfit ? "+" : "−";
  const netColorClass = isProfit ? "text-info" : "text-alert";
  const NetIcon = isProfit ? TrendingUp : TrendingDown;

  const netTrendData = (() => {
    if (!trendData) return [];
    const datesMap: Record<string, { sales: number; outgoings: number }> = {};
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toLocaleDateString("en-CA");
      if (key) datesMap[key] = { sales: 0, outgoings: 0 };
    }
    for (const item of trendData.salesTrend) {
      if (item.day && datesMap[item.day]) datesMap[item.day].sales += item.total;
    }
    for (const item of trendData.expensesTrend) {
      if (item.day && datesMap[item.day]) datesMap[item.day].outgoings += item.total;
    }
    for (const item of trendData.purchasesTrend) {
      if (item.day && datesMap[item.day]) datesMap[item.day].outgoings += item.total;
    }
    return Object.keys(datesMap).sort().map(k => datesMap[k].sales - datesMap[k].outgoings);
  })();

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
      <div className="space-y-5">
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
          <div className="space-y-4">
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

            {/* طلبات للتسليم (الأهم — أول عنصر في الصفحة) */}
            {stats && (
              <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
                <div className={
                  stats.upcomingOrders.length > 0
                    ? `flex items-center justify-between p-3.5 -mx-6 -mt-6 rounded-t-lg text-white font-bold ${glowClass}`
                    : "flex items-center justify-between border-b border-hairline pb-3"
                }>
                  <h3 className={`text-base font-bold flex items-center gap-1.5 min-w-0 ${stats.upcomingOrders.length > 0 ? "text-white" : "text-ink"}`}>
                    <Calendar className={`h-4.5 w-4.5 shrink-0 ${stats.upcomingOrders.length > 0 ? "text-white" : "text-info"}`} />
                    <span className="truncate">طلبات يستحق تسليمها (خلال 7 أيام)</span>
                  </h3>
                  <span className={`text-xs shrink-0 ${stats.upcomingOrders.length > 0 ? "text-white/90" : "text-ink/45"}`}>
                    {stats.upcomingOrders.length} طلبات
                  </span>
                </div>
                {stats.upcomingOrders.length === 0 ? (
                  <p className="text-sm text-ink/45 text-center py-6 bg-canvas rounded-lg border border-hairline">لا توجد طلبات يستحق تسليمها هذا الأسبوع</p>
                ) : (
                  <div className="divide-y divide-hairline">
                    {stats.upcomingOrders.map((o) => (
                      <Link
                        key={o.id}
                        href={`/orders?view=${o.id}`}
                        className="flex items-center justify-between gap-3 py-3 hover:bg-canvas px-2 -mx-2 rounded transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-ink text-sm truncate">{o.customerName}</p>
                          <p className="text-xs text-ink/50 mt-0.5 truncate">{o.productName}</p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className="text-xs text-ink/45 whitespace-nowrap">
                            {o.deliveryDate
                              ? new Date(o.deliveryDate).toLocaleDateString("ar-JO", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })
                              : "تاريخ غير محدد"}
                          </p>
                          <p className="text-sm font-bold text-info mt-0.5 whitespace-nowrap">
                            <AmountText amount={o.totalPriceCents} />
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {/* صافي التدفق النقدي (أزرق في الربح، أحمر في الخسارة - غير معتمد على اللون فقط) */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <NetIcon className={`h-4 w-4 ${netColorClass}`} />
                    صافي التدفق النقدي
                  </span>
                  <TrendArrow data={netTrendData} goodWhenUp={true} />
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span
                    className={`text-lg lg:text-xl font-bold flex items-baseline gap-1 ${netColorClass} whitespace-nowrap min-w-0`}
                  >
                    <span className="font-mono text-base shrink-0">{netSign}</span>
                    <AmountText amount={Math.abs(net)} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate" title="مبيعات − مشتريات − مصاريف">
                    مبيعات − مشتريات − مصاريف
                  </span>
                </div>
              </div>

              {/* إجمالي المبيعات (أزرق - Info) */}
              <Link
                href="/finance?tab=sales"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <ShoppingBag className="h-4 w-4 text-info" />
                    المبيعات
                  </span>
                  <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-info flex items-baseline gap-1 whitespace-nowrap min-w-0">
                    <span className="font-mono text-base shrink-0">+</span>
                    <AmountText amount={summary?.sales ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    إجمالي الإيرادات
                  </span>
                  {stats && stats.totalDepositsCents > 0 && (
                    <span
                      className="text-[10px] text-ink-3 mt-1 flex flex-wrap items-baseline gap-x-1 cursor-help"
                      title="يمثل قيمة العربون المدفوعة مقدماً لطلبات لم تُسلّم بعد في هذه الفترة (دخلت ماليّاً قبل التسليم)"
                    >
                      <span>يشمل طلبات بعربون:</span>
                      <AmountText amount={stats.totalDepositsCents} />
                    </span>
                  )}
                </div>
              </Link>

              {/* إجمالي المشتريات (أحمر - Alert) */}
              <Link
                href="/finance?tab=purchases"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-alert/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <ShoppingCart className="h-4 w-4 text-alert" />
                    المشتريات
                  </span>
                  <ArrowLeft className="h-4 w-4 text-alert/0 group-hover:text-alert transition-all transform group-hover:-translate-x-1" />
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-alert flex items-baseline gap-1 whitespace-nowrap min-w-0">
                    <span className="font-mono text-base shrink-0">−</span>
                    <AmountText amount={summary?.purchases ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    مواد خام
                  </span>
                </div>
              </Link>

              {/* إجمالي المصاريف (أحمر - Alert) */}
              <Link
                href="/finance?tab=expenses"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-alert/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <ArrowDownRight className="h-4 w-4 text-alert" />
                    المصاريف
                  </span>
                  <ArrowLeft className="h-4 w-4 text-alert/0 group-hover:text-alert transition-all transform group-hover:-translate-x-1" />
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-alert flex items-baseline gap-1 whitespace-nowrap min-w-0">
                    <span className="font-mono text-base shrink-0">−</span>
                    <AmountText amount={summary?.expenses ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    تشغيل ورواتب
                  </span>
                </div>
              </Link>

              {/* بطاقة التقارير (أزرق - Info) */}
              <Link
                href="/reports"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group col-span-2 lg:col-span-1"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <BarChart3 className="h-4 w-4 text-info" />
                    التقارير
                  </span>
                  <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-info whitespace-nowrap">
                    عرض التقارير
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    الربح والوضع المالي
                  </span>
                </div>
              </Link>
            </div>

            {/* قسم الملخص النقدي الجديد (التزاماً بـ §8.2) */}
            <div className="space-y-3 pt-2">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-info" />
                الملخص النقدي
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* كاش الصندوق — تحويل سريع */}
                <Link
                  href="/finance?tab=accounts&newTransfer=true"
                  className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                      <Wallet className="h-4 w-4 text-info animate-pulse" />
                      كاش الصندوق
                    </span>
                    <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                  </div>
                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="text-lg lg:text-xl font-bold text-info flex items-baseline gap-1 whitespace-nowrap min-w-0">
                      <span className="font-mono text-base shrink-0">+</span>
                      <AmountText amount={totalCashCents} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1 truncate">
                      رصيد النقدية الحالي
                    </span>
                  </div>
                </Link>

                {/* رصيد البنك — تحويل سريع */}
                <Link
                  href="/finance?tab=accounts&newTransfer=true"
                  className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                      <Landmark className="h-4 w-4 text-info" />
                      رصيد البنك
                    </span>
                    <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                  </div>
                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="text-lg lg:text-xl font-bold text-info flex items-baseline gap-1 whitespace-nowrap min-w-0">
                      <span className="font-mono text-base shrink-0">+</span>
                      <AmountText amount={totalBankCents} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1 truncate">
                      إجمالي حسابات البنك
                    </span>
                  </div>
                </Link>

                {/* العربون بحوزتك — سحب مالك */}
                <Link
                  href="/finance?tab=owner&newOwnerTx=true"
                  className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                      <TrendingUp className="h-4 w-4 text-info" />
                      العربون بحوزتك
                    </span>
                    <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                  </div>
                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="text-lg lg:text-xl font-bold text-info flex items-baseline gap-1 whitespace-nowrap min-w-0">
                      <span className="font-mono text-base shrink-0">+</span>
                      <AmountText amount={cashSummary?.depositsHeldCents ?? 0} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1 truncate">
                      عربون محتجَز للطلبات
                    </span>
                  </div>
                </Link>

                {/* مبالغ متوقعة (متبقي الطلبات) — display only */}
                <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                    <Calendar className="h-4 w-4 text-ink-3" />
                    مبالغ متوقعة (متبقي الطلبات)
                  </span>
                  <div className="mt-2 flex flex-col min-w-0">
                    <span className="text-lg lg:text-xl font-bold text-ink-2 flex items-baseline gap-1 whitespace-nowrap min-w-0">
                      <span className="font-mono text-base shrink-0">+</span>
                      <AmountText amount={cashSummary?.expectedRemainingCents ?? 0} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1 truncate">
                      متبقٍّ متوقّع عند التسليم
                    </span>
                  </div>
                </div>
              </div>
            </div>
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
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { status: "draft", label: "مسودة", color: "text-warn-deep bg-warn-soft border-warn/10" },
                { status: "sent", label: "تم الإرسال", color: "text-info bg-info-soft border-info/10" },
                { status: "confirmed", label: "مؤكد", color: "text-info bg-info-soft border-info/10" },
                { status: "delivered", label: "تم التوصيل", color: "text-info bg-info-soft border-info/10" },
                { status: "cancelled", label: "ملغى", color: "text-alert bg-alert-soft border-alert/10" },
              ].map((s) => (
                <div key={s.status} className={`p-3 rounded-lg border flex flex-col items-center justify-center ${s.color}`}>
                  <p className="text-2xl font-black">{stats.ordersByStatus[s.status] ?? 0}</p>
                  <p className="text-xs font-bold mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* آخر النشاطات والعمليات المدمجة */}
        <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <h3 className="text-base font-bold text-ink flex items-center gap-1.5">
              <Clock className="h-4.5 w-4.5 text-info" />
              آخر النشاطات والحركات المالية
            </h3>
            <span className="text-xs text-ink/45">محدث لحظياً</span>
          </div>

          {isLoadingActivities ? (
            <SkeletonList count={3} />
          ) : !activities || activities.length === 0 ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-hairline rounded-lg flex flex-col items-center justify-center gap-4 bg-canvas">
              <div className="p-3 bg-info-soft rounded-full">
                <Clock className="h-6 w-6 text-info" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-ink">
                  مرحباً بك في نظام Zman!
                </p>
                <p className="text-xs text-ink/60 max-w-sm mx-auto leading-relaxed">
                  لم يتم تسجيل أي عمليات أو نشاطات بعد. ابدأ الآن بإضافة طلب
                  جديد أو مبيعات ومشتريات للورشة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link
                  href="/orders?new=true"
                  className="min-h-[44px] px-4 py-2 bg-ink text-paper rounded-md text-xs font-bold shadow-sm hover:bg-ink/90 flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>طلب جديد</span>
                </Link>
                <Link
                  href="/finance?tab=sales&newSale=true"
                  className="min-h-[44px] px-4 py-2 bg-info text-paper rounded-md text-xs font-bold shadow-sm hover:bg-info/90 flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>عملية بيع</span>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {activities.map((act) => {
                // إعداد الروابط وتوجيهها لتكون تفاعلية
                const linkHref =
                  act.type === "order"
                    ? `/orders?view=${act.id}`
                    : act.type === "sale"
                      ? `/finance?tab=sales&editSale=${act.id}`
                      : act.type === "expense"
                        ? `/finance?tab=expenses&editExpense=${act.id}`
                        : `/finance?tab=purchases&editPurchase=${act.id}`;

                const typeLabels = {
                  order: {
                    label: "طلب معتمد",
                    color: "text-info bg-info-soft",
                  },
                  sale: {
                    label: "إيراد مبيعات",
                    color: "text-info bg-info-soft",
                  },
                  expense: {
                    label: "مصروف عام",
                    color: "text-alert bg-alert-soft",
                  },
                  purchase: {
                    label: "مشتريات مواد",
                    color: "text-alert bg-alert-soft",
                  },
                };

                const details = typeLabels[act.type];

                return (
                  <Link
                    key={act.id}
                    href={linkHref}
                    className="py-3.5 flex items-center justify-between hover:bg-canvas px-2 -mx-2 rounded transition-colors min-w-0 gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`px-2.5 py-1 rounded text-[10px] font-bold shrink-0 ${details.color}`}
                      >
                        {details.label}
                      </span>
                      <span className="text-sm font-semibold text-ink/85 truncate flex-1 min-w-0">
                        {act.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-sm font-bold ${act.type === "order" || act.type === "sale" ? "text-info" : "text-alert"}`}
                      >
                        {act.type === "order" || act.type === "sale"
                          ? "+"
                          : "−"}
                        <AmountText amount={act.amount} />
                      </span>
                      <ArrowLeft className="h-4 w-4 text-ink/30 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

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
            <div className="grid grid-cols-3 gap-2">
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
      <button
        type="button"
        onClick={() => setIsFabOpen(true)}
        className="fixed bottom-20 lg:bottom-6 inset-s-4 z-dropdown h-14 w-14 rounded-full bg-ink text-paper shadow-lg flex items-center justify-center hover:bg-ink/90 active:scale-95 transition-all"
        aria-label="إضافة عملية جديدة"
      >
        <Plus className="h-6 w-6" />
      </button>

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
