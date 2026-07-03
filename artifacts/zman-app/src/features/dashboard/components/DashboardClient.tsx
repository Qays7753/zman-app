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
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useTransition } from "react";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { ErrorState } from "@/components/shared/ErrorState";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { FilterChip } from "@/components/shared/FilterChip";
import {
  useFinancialSummary,
  useFinancialTrendData,
  useRecentActivities,
  useDashboardStats,
  useCashSummary,
} from "../hooks";

// تحميل الرسم البياني ديناميكياً لتقليل حزم التحميل المبدئي (§12.1)
const FinancialChart = dynamic(() => import("./FinancialChart"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full bg-paper rounded-lg border border-hairline animate-pulse" />
  ),
});

export function DashboardClient() {
  const [_isPending, _startTransition] = useTransition();

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

  const handleRetryAll = () => {
    refetchSummary();
    refetchActivities();
    refetchTrend();
    refetchStats();
    refetchCash();
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
        <AppShellHeader title="لوحة القيادة والمؤشرات" />
        <div className="flex-1 flex items-center justify-center">
          <ErrorState
            message="حدث خطأ أثناء تحميل بيانات لوحة القيادة. يرجى التحقق من اتصالك وحاول مجدداً."
            onRetry={handleRetryAll}
          />
        </div>
      </>
    );
  }

  // معالجة صافي الأرباح لتحديد اللون والإشارة للتسهيل على فاقدي التمييز اللوني (§14.3)
  const net = summary?.netProfit ?? 0;
  const isProfit = net >= 0;
  const netSign = isProfit ? "+" : "−";
  const netColorClass = isProfit ? "text-info" : "text-alert";
  const NetIcon = isProfit ? TrendingUp : TrendingDown;

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
        <div className="hidden lg:flex items-center gap-1.5 p-1 bg-paper rounded-lg border border-hairline self-start">
          {presets.map((preset, i) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePresetSelect(i)}
              className={`px-4 min-h-[44px] h-11 rounded-md text-xs font-bold transition-all ${
                selectedPresetIdx === i && !customRange
                  ? "bg-info text-paper shadow-sm"
                  : "text-ink/60 hover:text-ink/80 hover:bg-canvas"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsSelectorOpen(true)}
            className={`px-4 min-h-[44px] h-11 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              customRange
                ? "bg-info text-paper shadow-sm"
                : "text-ink/60 hover:text-ink/80 hover:bg-canvas"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {customRange
              ? `${format(customRange.start, "MM/dd")} - ${format(customRange.end, "MM/dd")}`
              : "تخصيص"}
          </button>
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
            {/* بطاقة هيرو عريضة لصافي الأرباح والخسائر (§H3) */}
            <div className="p-6 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between w-full">
              <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                <span className="text-sm font-bold text-ink/65 flex items-center gap-1.5">
                  <NetIcon className={`h-5 w-5 ${netColorClass}`} />
                  صافي الأرباح والخسائر للفترة
                </span>
                <span className="text-[10px] text-ink/40 font-mono">
                  {startDateStr} - {endDateStr}
                </span>
              </div>
              <div className="mt-4">
                <span
                  className={`text-4xl font-bold flex items-center gap-1.5 ${netColorClass}`}
                >
                  <span className="font-mono">{netSign}</span>
                  <AmountText amount={Math.abs(net)} />
                </span>
                <p className="text-xs text-ink/50 mt-2">
                  (الإيرادات والمبيعات − التكاليف والمصاريف التشغيلية)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* صافي الأرباح (أزرق في الربح، أحمر في الخسارة - غير معتمد على اللون فقط) */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                  <NetIcon className={`h-4 w-4 ${netColorClass}`} />
                  صافي الأرباح
                </span>
                <div className="mt-2 flex flex-col">
                  <span
                    className={`text-xl lg:text-2xl font-bold flex items-center gap-1 ${netColorClass}`}
                  >
                    <span className="font-mono text-lg">{netSign}</span>
                    <AmountText amount={Math.abs(net)} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1">
                    المبيعات ناقصاً كل التكاليف
                  </span>
                </div>
              </div>

              {/* إجمالي المبيعات (أزرق - Info) */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                  <ShoppingBag className="h-4 w-4 text-info" />
                  المبيعات
                </span>
                <div className="mt-2 flex flex-col">
                  <span className="text-xl lg:text-2xl font-bold text-info flex items-center gap-1">
                    <span className="font-mono text-lg">+</span>
                    <AmountText amount={summary?.sales ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1">
                    مجموع الإيرادات الواردة
                  </span>
                  {stats && stats.totalDepositsCents > 0 && (
                    <span className="text-[10px] text-ink-3 mt-1 block">
                      منه عربون: <AmountText amount={stats.totalDepositsCents} />
                    </span>
                  )}
                </div>
              </div>

              {/* إجمالي المشتريات (أحمر - Alert) */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                  <ShoppingCart className="h-4 w-4 text-alert" />
                  المشتريات
                </span>
                <div className="mt-2 flex flex-col">
                  <span className="text-xl lg:text-2xl font-bold text-alert flex items-center gap-1">
                    <span className="font-mono text-lg">−</span>
                    <AmountText amount={summary?.purchases ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1">
                    تكاليف المواد الخام والخامات
                  </span>
                </div>
              </div>

              {/* إجمالي المصاريف (أحمر - Alert) */}
              <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                  <ArrowDownRight className="h-4 w-4 text-alert" />
                  المصاريف
                </span>
                <div className="mt-2 flex flex-col">
                  <span className="text-xl lg:text-2xl font-bold text-alert flex items-center gap-1">
                    <span className="font-mono text-lg">−</span>
                    <AmountText amount={summary?.expenses ?? 0} />
                  </span>
                  <span className="text-[10px] text-ink/40 mt-1">
                    تكاليف التشغيل والرواتب والفواتير
                  </span>
                </div>
              </div>
            </div>

            {/* قسم الملخص النقدي الجديد */}
            <div className="space-y-3 pt-2">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-info" />
                الملخص النقدي
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* الأرباح المحققة */}
                <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <NetIcon className={`h-4 w-4 ${netColorClass}`} />
                    الأرباح المحققة (من المبيعات)
                  </span>
                  <div className="mt-2 flex flex-col">
                    <span className={`text-xl lg:text-2xl font-bold flex items-center gap-1 ${netColorClass}`}>
                      <span className="font-mono text-lg">{netSign}</span>
                      <AmountText amount={Math.abs(net)} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1">
                      النقد الفعلي المستلم بعد خصم المشتريات والمصاريف
                    </span>
                  </div>
                </div>

                {/* العربون بحوزتك */}
                <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4 text-info" />
                    العربون بحوزتك
                  </span>
                  <div className="mt-2 flex flex-col">
                    <span className="text-xl lg:text-2xl font-bold text-info flex items-center gap-1">
                      <span className="font-mono text-lg">+</span>
                      <AmountText amount={cashSummary?.depositsHeldCents ?? 0} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1">
                      مبالغ العربون المستلمة للطلبات المعلقة (قيد التنفيذ)
                    </span>
                  </div>
                </div>

                {/* مبالغ متوقعة (متبقي الطلبات) */}
                <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col justify-between">
                  <span className="text-xs font-bold text-ink/65 flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-ink-3" />
                    مبالغ متوقعة (متبقي الطلبات)
                  </span>
                  <div className="mt-2 flex flex-col">
                    <span className="text-xl lg:text-2xl font-bold text-ink-2 flex items-center gap-1">
                      <span className="font-mono text-lg">+</span>
                      <AmountText amount={cashSummary?.expectedRemainingCents ?? 0} />
                    </span>
                    <span className="text-[10px] text-ink/40 mt-1">
                      المتبقي المتفق عليه عند تسليم الطلبات المعلقة (مخصوم منه العربون)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* الرسم البياني لتوجهات التدفق المالي */}
        {!isLoadingTrend && trendData && (
          <FinancialChart
            salesData={trendData.salesTrend}
            expensesData={trendData.expensesTrend}
            purchasesData={trendData.purchasesTrend}
            startDate={startDateStr}
            endDate={endDateStr}
          />
        )}

        {/* حالة الطلبات التشغيلية */}
        {stats && (
          <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="text-md font-bold text-ink flex items-center gap-1.5">
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

        {/* طلبات للتسليم قريباً */}
        {stats && (
          <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="text-md font-bold text-ink flex items-center gap-1.5">
                <Calendar className="h-4.5 w-4.5 text-info" />
                طلبات يستحق تسليمها قريباً (خلال 7 أيام)
              </h3>
              <span className="text-xs text-ink/45">{stats.upcomingOrders.length} طلبات</span>
            </div>
            {stats.upcomingOrders.length === 0 ? (
              <p className="text-sm text-ink/45 text-center py-6 bg-canvas rounded-lg border border-hairline">لا توجد طلبات يستحق تسليمها هذا الأسبوع</p>
            ) : (
              <div className="divide-y divide-hairline">
                {stats.upcomingOrders.map((o) => (
                  <Link
                    key={o.id}
                    href={`/orders?view=${o.id}`}
                    className="flex items-center justify-between py-3 hover:bg-canvas px-2 -mx-2 rounded transition-colors"
                  >
                    <div>
                      <p className="font-bold text-ink text-sm">{o.customerName}</p>
                      <p className="text-xs text-ink/50 mt-0.5">{o.productName}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-ink/45">
                        {o.deliveryDate
                          ? new Date(o.deliveryDate).toLocaleDateString("ar-JO", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "تاريخ غير محدد"}
                      </p>
                      <p className="text-sm font-bold text-info mt-0.5">
                        <AmountText amount={o.totalPriceCents} />
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* آخر النشاطات والعمليات المدمجة */}
        <div className="bg-paper p-6 rounded-lg border border-hairline shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <h3 className="text-md font-bold text-ink flex items-center gap-1.5">
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

      {/* الزر العائم للهواتف المحمولة (FAB) (§H3) */}
      <button
        type="button"
        onClick={() => setIsFabOpen(true)}
        className="fixed bottom-24 inset-s-6 lg:hidden z-dropdown h-14 w-14 rounded-full bg-ink text-paper shadow-lg flex items-center justify-center hover:bg-ink/90 active:scale-95 transition-all"
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
        <div className="grid grid-cols-2 gap-4">
          <Link
            href="/orders?new=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ClipboardList className="h-6 w-6 text-info" />
            <span className="text-sm font-bold text-ink">طلب جديد</span>
          </Link>
          <Link
            href="/finance?tab=sales&newSale=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ShoppingBag className="h-6 w-6 text-info" />
            <span className="text-sm font-bold text-ink">عملية بيع</span>
          </Link>
          <Link
            href="/finance?tab=expenses&newExpense=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ArrowDownRight className="h-6 w-6 text-alert" />
            <span className="text-sm font-bold text-ink">مصروف جديد</span>
          </Link>
          <Link
            href="/finance?tab=purchases&newPurchase=true"
            onClick={() => setIsFabOpen(false)}
            className="flex flex-col items-center justify-center p-4 bg-canvas rounded-lg border border-hairline hover:border-ink/20 transition-colors gap-2 min-h-[80px]"
          >
            <ShoppingCart className="h-6 w-6 text-alert" />
            <span className="text-sm font-bold text-ink">تسجيل مشتريات</span>
          </Link>
        </div>
      </ResponsiveModal>
    </>
  );
}
