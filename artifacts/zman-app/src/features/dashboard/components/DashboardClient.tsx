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
  useRecentActivities,
  useDashboardStats,
  useCashSummary,
  useAccountBalances,
} from "../hooks";
import { useOpeningBalance } from "@/features/finance/hooks";
import { FloatingActionButton } from "@/components/shared/FloatingActionButton";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/status-colors";

// أسماء الأشهر الميلادية بالعربي (ترتيب getMonth: 0=يناير).
const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

/**
 * لوحة المقارنة المالية الموحّدة (مبيعات · مشتريات · مصاريف · صافي الربح).
 * محسّنة للموبايل: أشرطة أفقية نسبية بطول متناسب مع أكبر قيمة، ليقرأ المالك
 * الأكبر من الأصغر بلمحة، وسطر صافي ربح مميّز أسفلها.
 */
function FinanceComparePanel({
  actualSales,
  purchases,
  expenses,
  netProfit,
}: {
  actualSales: number;
  purchases: number;
  expenses: number;
  netProfit: number;
}) {
  const rows = [
    { label: "المبيعات الفعلية", value: actualSales, barClass: "bg-info", textClass: "text-info", sign: "+" },
    { label: "المشتريات المدفوعة", value: purchases, barClass: "bg-alert", textClass: "text-alert", sign: "−" },
    { label: "المصاريف المدفوعة", value: expenses, barClass: "bg-warn-deep", textClass: "text-warn-deep", sign: "−" },
  ];
  // أطول شريط يُحسب نسبةً لأكبر قيمة موجبة (نتجنب القسمة على صفر).
  const maxValue = Math.max(actualSales, purchases, expenses, 1);
  const isProfit = netProfit >= 0;

  return (
    <div className="bg-paper rounded-lg border border-hairline shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink flex items-center gap-1.5">
          <BarChart3 className="h-4.5 w-4.5 text-info" />
          مقارنة الأداء المالي
        </h3>
        <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded shrink-0">
          للفترة المختارة
        </span>
      </div>

      {/* الأشرطة النسبية */}
      <div className="space-y-3.5">
        {rows.map((row) => {
          const pct = Math.round((row.value / maxValue) * 100);
          return (
            <div key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-ink-2 truncate">{row.label}</span>
                <span className={`text-sm font-black font-mono whitespace-nowrap flex items-baseline gap-0.5 ${row.textClass}`}>
                  <span>{row.sign}</span>
                  <AmountText amount={row.value} />
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

      {/* سطر صافي الربح المميّز */}
      <div className={`flex items-center justify-between gap-2 pt-3 border-t-2 ${isProfit ? "border-info/30" : "border-alert/30"}`}>
        <span className="text-sm font-bold text-ink flex items-center gap-1.5">
          {isProfit ? <TrendingUp className="h-4.5 w-4.5 text-info" /> : <TrendingDown className="h-4.5 w-4.5 text-alert" />}
          صافي الربح
        </span>
        <span className={`text-lg font-black font-mono whitespace-nowrap flex items-baseline gap-1 ${isProfit ? "text-info" : "text-alert"}`}>
          <span className="text-base">{isProfit ? "+" : "−"}</span>
          <AmountText amount={Math.abs(netProfit)} />
        </span>
      </div>
      <p className="text-[10px] text-ink/45 leading-snug -mt-2">
        صافي الربح = المبيعات الفعلية − المشتريات − المصاريف (العربون لا يُحسب ربحاً قبل التسليم).
      </p>
    </div>
  );
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
        // اسم الشهر الميلادي بالعربي (مثلاً "يوليو") — أوضح من "الشهر الحالي"
        // ومقروء على الموبايل. نستخدم مصفوفة يدوية لضمان أسماء الأشهر الميلادية.
        label: AR_MONTHS[d.getMonth()]!,
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
    data: activities,
    isLoading: isLoadingActivities,
    isError: isErrorActivities,
    refetch: refetchActivities,
  } = useRecentActivities(startDateStr, endDateStr);
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

  const [isDeliveriesExpanded, setIsDeliveriesExpanded] = useState(false);
  const handleToggleDeliveries = () => {
    setIsDeliveriesExpanded(!isDeliveriesExpanded);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRetryAll = () => {
    refetchSummary();
    refetchActivities();
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

  if (isErrorSummary || isErrorActivities || isErrorCash) {
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

            {/* 5. طلبات للتسليم (طلبات يستحق تسليمها) — منقولة لأعلى الصفحة وقابلة للطي */}
            {stats && (
              <div className="bg-paper rounded-lg border border-hairline shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={handleToggleDeliveries}
                  className={`w-full flex items-center justify-between p-4 transition-colors text-right font-bold ${
                    stats.upcomingOrders.length > 0
                      ? `text-white ${glowClass}`
                      : "bg-canvas/30 hover:bg-canvas/50 text-ink"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Calendar className={`h-5 w-5 shrink-0 ${stats.upcomingOrders.length > 0 ? "text-white" : "text-info"}`} />
                    <span className="text-sm md:text-base truncate">
                      طلبات يستحق تسليمها (خلال 7 أيام) — {stats.upcomingOrders.length} طلبات
                    </span>
                  </div>
                  <span className={`text-xs transition-transform ${isDeliveriesExpanded ? "rotate-180" : ""}`}>
                    {isDeliveriesExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {isDeliveriesExpanded && (
                  <div className="p-6 border-t border-hairline space-y-4">
                    {stats.upcomingOrders.length === 0 ? (
                      <p className="text-sm text-ink/45 text-center py-6 bg-canvas rounded-lg border border-hairline">
                        لا توجد طلبات يستحق تسليمها هذا الأسبوع
                      </p>
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
                              <p className="text-xs text-ink-2 mt-1 whitespace-nowrap flex flex-col items-end gap-0.5">
                                <span>قيمة الطلب: <AmountText amount={o.totalPriceCents} /></span>
                                {o.depositCents > 0 && (
                                  <span className="text-[10px] text-info font-bold">
                                    العربون المُحصَّل: +<AmountText amount={o.depositCents} />
                                  </span>
                                )}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ═══ القسم 1: ما تملكه نقداً الآن (السيولة) ═══ */}
            <div className="flex items-center gap-2 px-1">
              <Wallet className="h-5 w-5 text-info" />
              <h2 className="text-sm font-black text-ink">ما تملكه نقداً الآن</h2>
              <span className="text-[10px] text-ink/40">(سيولة — رصيد لحظي لا يتأثر بالفترة)</span>
              <div className="flex-1 border-t border-info/20 ml-2" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. الوضع النقدي الحالي (Current Cash Position Hero) */}
              {cashSummary && (
                <div className="md:col-span-2 bg-gradient-to-r from-info-soft to-info/5 p-6 rounded-xl border border-info/20 shadow-sm flex flex-col justify-between gap-4">
                  <div className="flex items-center justify-between w-full">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-ink/65 flex items-center gap-1.5">
                        <Wallet className="h-4.5 w-4.5 text-info animate-pulse" />
                        إجمالي النقد المتاح
                      </span>
                      <h2 className="text-2xl lg:text-3xl font-black text-info flex items-baseline gap-1 whitespace-nowrap min-w-0">
                        <AmountText amount={totalCashCents + totalBankCents} />
                      </h2>
                      <p className="text-[10px] text-ink/50 mt-0.5">
                        = نقد الصندوق + البنك (كل ما تملكه نقدًا الآن)
                      </p>
                    </div>
                    <div className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded">
                      رصيد لحظي
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-hairline-2">
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-ink/40">صندوق (نقد متاح)</p>
                      <p className="text-sm font-bold text-ink-3">
                        <AmountText amount={totalCashCents} />
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-ink/40">حسابات البنك</p>
                      <p className="text-sm font-bold text-ink-3">
                        <AmountText amount={totalBankCents} />
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* عربونات بحوزتك (التزام مالي) — ضمن قسم السيولة لأنها نقد متاح لكنه ملتزم */}
              {cashSummary && (
                <div className="bg-warn-soft/30 p-6 rounded-xl border border-warn/15 shadow-sm flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-ink/65 flex items-center gap-1.5">
                      <AlertCircle className="h-4.5 w-4.5 text-warn-deep" />
                      عربونات بحوزتك
                    </span>
                    <h3 className="text-xl lg:text-2xl font-black text-warn-deep mt-1">
                      <AmountText amount={cashSummary.depositsHeldCents} />
                    </h3>
                    <p className="text-[10px] text-ink/50 mt-0.5">
                      نقد قبضته لكنه التزام — يجب تسليم الطلب أو إرجاعه
                    </p>
                  </div>
                  <div className="pt-2 border-t border-warn/15">
                    <p className="text-[10px] text-ink/50">متبقٍّ متوقع تحصيله</p>
                    <p className="text-sm font-bold text-info">
                      <AmountText amount={cashSummary.expectedRemainingCents} />
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ القسم 2: ما ربحته من عملك (للفترة المختارة) ═══ */}
            <div className="flex items-center gap-2 px-1 pt-4">
              <TrendingUp className="h-5 w-5 text-info" />
              <h2 className="text-sm font-black text-ink">أداء عملك للفترة المختارة</h2>
              <span className="text-[10px] text-ink/40">(ربح/خسارة — ليس نقداً في جيبك)</span>
              <div className="flex-1 border-t border-info/20 ml-2" />
            </div>

            {/* لوحة المقارنة المالية الموحّدة — مبيعات · مشتريات · مصاريف · صافي ربح */}
            {summary && (
              <FinanceComparePanel
                actualSales={summary.actualSales ?? 0}
                purchases={summary.purchases ?? 0}
                expenses={summary.expenses ?? 0}
                netProfit={summary.netProfit ?? 0}
              />
            )}

            {/* تفاصيل مكمّلة: حركة المالك + الإيرادات النقدية + المشتريات + المصاريف */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* صافي حركة المالك (سحب/حقن) للفترة المختارة */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <User className={`h-4 w-4 ${ownerNet >= 0 ? "text-info" : "text-alert"}`} />
                    حركة المالك (سحب/حقن)
                  </span>
                  <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded">
                    للفترة المختارة
                  </span>
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span
                    className={`text-lg lg:text-xl font-bold flex items-baseline gap-1 ${ownerNet >= 0 ? "text-info" : "text-alert"} whitespace-nowrap min-w-0`}
                  >
                    <span className="font-mono text-base shrink-0">{ownerNet >= 0 ? "+" : "−"}</span>
                    <AmountText amount={Math.abs(ownerNet)} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    صافي حقن − صافي سحب (ليست ربحاً/خسارة)
                  </span>
                </div>
                <p className="text-[9px] text-ink/50 leading-snug mt-2 pt-2 border-t border-hairline">
                  سحوبات المالك تُخصم من النقد لكنها ليست مصروف تشغيل
                </p>
              </div>

              {/* الإيرادات النقدية (بيع + عربون) — نقد داخل من الزبائن خلال الفترة */}
              <Link
                href="/finance?tab=sales"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-info/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                    <ShoppingBag className="h-4 w-4 text-info" />
                    إيرادات نقدية (بيع + عربون)
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded">
                      للفترة المختارة
                    </span>
                    <ArrowLeft className="h-4 w-4 text-info/0 group-hover:text-info transition-all transform group-hover:-translate-x-1" />
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5">
                    <span className="text-[10px] text-ink/50">مبيعات فعلية:</span>
                    <span className="text-sm font-bold text-info flex items-baseline gap-0.5 font-mono whitespace-nowrap">
                      <span>+</span>
                      <AmountText amount={summary?.actualSales ?? 0} />
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5 border-t border-dashed border-hairline pt-1.5">
                    <span className="text-[10px] text-ink/50">عربونات محصّلة:</span>
                    <span className="text-sm font-bold text-info flex items-baseline gap-0.5 font-mono whitespace-nowrap">
                      <span>+</span>
                      <AmountText amount={summary?.deposits ?? 0} />
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-0.5 border-t border-hairline pt-1.5 font-bold">
                    <span className="text-[10px] text-ink">الإجمالي:</span>
                    <span className="text-sm font-black text-info flex items-baseline gap-0.5 font-mono whitespace-nowrap">
                      <span>+</span>
                      <AmountText amount={summary?.sales ?? 0} />
                    </span>
                  </div>
                  <p className="text-[9px] text-ink/45 leading-snug mt-1 font-sans">
                    العربون نقد متاح تصرفه، لكنه يبقى التزامًا حتى تسليم الطلب.
                  </p>
                </div>
              </Link>

              {/* المشتريات المدفوعة */}
              <Link
                href="/finance?tab=purchases"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-alert/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                    <ShoppingCart className="h-4 w-4 text-alert" />
                    المشتريات المدفوعة
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded">
                      للفترة المختارة
                    </span>
                    <ArrowLeft className="h-4 w-4 text-alert/0 group-hover:text-alert transition-all transform group-hover:-translate-x-1" />
                  </div>
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-alert flex items-baseline gap-1 whitespace-nowrap min-w-0">
                    <span className="font-mono text-base shrink-0">−</span>
                    <AmountText amount={summary?.purchases ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    تكلفة الخامات والمواد
                  </span>
                </div>
              </Link>

              {/* المصاريف المدفوعة */}
              <Link
                href="/finance?tab=expenses"
                className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between hover:border-alert/40 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1 truncate">
                    <ArrowDownRight className="h-4 w-4 text-alert" />
                    المصاريف المدفوعة
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded">
                      للفترة المختارة
                    </span>
                    <ArrowLeft className="h-4 w-4 text-alert/0 group-hover:text-alert transition-all transform group-hover:-translate-x-1" />
                  </div>
                </div>
                <div className="mt-2 flex flex-col min-w-0">
                  <span className="text-lg lg:text-xl font-bold text-alert flex items-baseline gap-1 whitespace-nowrap min-w-0">
                    <span className="font-mono text-base shrink-0">−</span>
                    <AmountText amount={summary?.expenses ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1 truncate">
                    المصاريف التشغيلية والرواتب
                  </span>
                </div>
              </Link>
            </div>

            {/* 3. أبرز فئات المصاريف للفترة المختارة */}
            {stats && stats.topExpenses && stats.topExpenses.length > 0 && (
              <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-ink/65 flex items-center justify-between gap-1.5 w-full">
                  <span className="flex items-center gap-1.5 truncate">
                    <ArrowDownRight className="h-4.5 w-4.5 text-alert" />
                    أبرز فئات مصاريف التشغيل (للفترة المختارة)
                  </span>
                  <span className="px-2 py-0.5 bg-ink/10 text-ink-2 text-[9px] font-extrabold rounded shrink-0">
                    للفترة المختارة
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {stats.topExpenses.map((exp) => (
                    <div key={exp.category} className="p-3 bg-canvas rounded-lg border border-hairline flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{exp.category}</p>
                        <p className="text-[10px] text-ink/45 mt-0.5">{exp.count} حركات مالية</p>
                      </div>
                      <span className="font-bold text-alert shrink-0">
                        <AmountText amount={exp.totalCents} />
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
                      {(() => {
                        const isRealizedSale = act.type === "sale";
                        const isCashOut = act.type === "expense" || act.type === "purchase";
                        const isOrderWithDeposit = act.type === "order" && !!act.hasCashImpact;
                        const sign = (isRealizedSale || isOrderWithDeposit) ? "+" : isCashOut ? "−" : "";
                        const colorClass = (isRealizedSale || isOrderWithDeposit)
                          ? "text-info"
                          : isCashOut ? "text-alert" : "text-ink/45";
                        return (
                          <span className={`text-sm font-bold ${colorClass}`}>
                            {sign}
                            {act.amount > 0 || isRealizedSale || isCashOut
                              ? <AmountText amount={act.amount} />
                              : <span className="text-xs font-normal">بدون أثر نقدي</span>}
                          </span>
                        );
                      })()}
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
