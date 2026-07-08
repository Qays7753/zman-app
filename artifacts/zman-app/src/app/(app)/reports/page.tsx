"use client";

import {
  Archive,
  ArrowDownRight,
  BarChart2,
  Download,
  Loader2,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShellHeader } from "@/providers/app-shell-context";
import { AmountText } from "@/components/shared/AmountText";
import { Button } from "@/components/shared/Button";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { STATUS_COLORS } from "@/lib/status-colors";
import {
  downloadReport,
  getAllReportData,
  getFinancialPosition,
  type StructuredReportData,
} from "@/features/reports/actions";
import { IntegrityCheckReportPanel } from "@/features/reports/components/IntegrityCheckReportPanel";

const DONUT_COLORS = ["#1565c0", "#0f9d58", "#9f7300", "#c0392b"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-bold text-ink border-b border-hairline pb-3 mb-4">
      {children}
    </h3>
  );
}

/** زر تحميل تقرير — مكوّن موحّد يُستخدم لكل الأقسام بدل التكرار */
function DownloadBtn({
  type,
  title,
  downloadingId,
  onDownload,
}: {
  type: string;
  title: string;
  downloadingId: string | null;
  onDownload: (type: "pnl" | "expenses" | "sales" | "orders" | "products", title: string) => void;
}) {
  return (
    <Button
      onClick={() => onDownload(type as "pnl" | "expenses" | "sales" | "orders" | "products", title)}
      disabled={downloadingId !== null}
      isLoading={downloadingId === type}
      variant="secondary"
      size="sm"
      icon={downloadingId !== type ? <Download className="h-3.5 w-3.5" /> : undefined}
      aria-label={`تحميل تقرير ${title}`}
      title={`تحميل تقرير ${title}`}
      className="flex-shrink-0"
    >
      <span className="hidden sm:inline">تحميل</span>
    </Button>
  );
}

function StatCard({
  label,
  amount,
  sub,
  icon: Icon,
  colorClass,
  sign,
}: {
  label: string;
  amount: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  sign?: string;
}) {
  return (
    <div className="p-4 bg-paper rounded-lg border border-hairline shadow-sm flex flex-col gap-2">
      <span className={`text-xs font-bold flex items-center gap-1.5 ${colorClass}`}>
        <Icon className="h-4 w-4 flex-shrink-0" />
        {label}
      </span>
      <span className={`text-xl font-bold flex items-baseline gap-1 ${colorClass}`}>
        {sign && <span className="font-mono text-base">{sign}</span>}
        <AmountText amount={amount} />
      </span>
      <span className="text-[10px] text-ink/40 leading-snug">{sub}</span>
    </div>
  );
}

function ProgressBar({ pct, colorClass, style }: { pct: number; colorClass?: string; style?: React.CSSProperties }) {
  return (
    <div className="w-full bg-canvas rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${colorClass || ""}`}
        style={{ width: `${Math.min(100, pct)}%`, ...style }}
      />
    </div>
  );
}

export default function ReportsPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<"all" | "month" | "30d">("all");
  const [activeSection, setActiveSection] = useState<"analytics" | "balance_sheet">("analytics");
  const [activeReportTab, setActiveReportTab] = useState<"pnl" | "expenses" | "sales" | "orders" | "products">("pnl");
  const [asOfDate, setAsOfDate] = useState(() => new Date().toLocaleDateString("en-CA"));

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ["reports", dateRange],
    queryFn: async () => {
      const res = await getAllReportData(dateRange);
      if (res.status === "error") {
        toast.error(res.message);
        throw new Error(res.message);
      }
      return res.data || null;
    },
  });

  const { data: positionData, isLoading: positionLoading, refetch: refetchPosition } = useQuery({
    queryKey: ["financialPosition", asOfDate],
    queryFn: async () => {
      const res = await getFinancialPosition(asOfDate);
      if (res.status === "error") {
        toast.error(res.message);
        throw new Error(res.message);
      }
      return res.data || null;
    },
    enabled: activeSection === "balance_sheet" && !!asOfDate,
  });

  const data = queryData || null;

  const handleDownload = async (
    type: "pnl" | "expenses" | "sales" | "orders" | "products",
    title: string,
  ) => {
    setDownloadingId(type);
    try {
      const res = await downloadReport(type, dateRange);
      if (res.status === "ok" && res.data) {
        const BOM = "\uFEFF";
        const blob = new Blob([BOM + res.data], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const dateStr = new Date().toLocaleDateString("en-CA");
        const safeName = type;
        link.download = `report_${safeName}_${dateStr}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(`تم تحميل ${title} بنجاح`);
      } else {
        toast.error(res.status === "error" ? res.message : "فشل تحميل التقرير");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const net = data?.pnl.netCents ?? 0;
  const isProfit = net >= 0;

  return (
    <>
      <AppShellHeader
        title="التقارير"
        action={
          <div className="flex items-center gap-2">
            {/* زر التحديث */}
            <Button
              onClick={() => {
                void refetch();
                void refetchPosition();
              }}
              isLoading={isLoading || positionLoading}
              size="icon"
              variant="secondary"
              aria-label="تحديث البيانات"
              title="تحديث البيانات"
            >
              <RefreshCw className="h-4.5 w-4.5" />
            </Button>
            {/* مبدّل التقارير / الوضع المالي */}
            <SegmentedControl
              value={activeSection}
              onChange={(val) => setActiveSection(val as any)}
              compact
              options={[
                { value: "analytics", label: "التقارير", icon: <BarChart2 className="h-4.5 w-4.5" /> },
                { value: "balance_sheet", label: "الوضع المالي", icon: <Wallet className="h-4.5 w-4.5" /> },
              ]}
            />
          </div>
        }
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-hairline">
          <div>
            <p className="text-xs text-ink/50">
              آخر تحديث: {new Date().toLocaleString("ar-JO", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>

          {activeSection === "analytics" ? (
            /* فلتر فترة التقارير */
            <SegmentedControl
              value={dateRange}
              onChange={(val) => setDateRange(val as any)}
              options={[
                { value: "all", label: "كل الفترات" },
                { value: "month", label: "هذا الشهر" },
                { value: "30d", label: "آخر 30 يوم" },
              ]}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink/70">تاريخ الحساب:</span>
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="h-10 px-3 bg-canvas border border-hairline rounded-md text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ink"
              />
            </div>
          )}
        </div>

        {activeSection === "analytics" ? (
          isLoading ? (
            <SkeletonList count={4} />
          ) : !data ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <p className="text-sm text-ink/60">تعذّر تحميل البيانات</p>
              <Button
                onClick={() => void refetch()}
                variant="ink"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* تبويبات الأقسام الخمسة للتقارير مدمجة في شريط واحد يمرر أفقياً بسلاسة */}
              <div className="w-full overflow-x-auto no-scrollbar pb-1">
                <SegmentedControl
                  value={activeReportTab}
                  onChange={(val) => setActiveReportTab(val as any)}
                  options={[
                    { value: "pnl", label: "الأرباح والخسائر", icon: <TrendingUp className="h-3.5 w-3.5" /> },
                    { value: "expenses", label: "المصاريف", icon: <Wallet className="h-3.5 w-3.5" /> },
                    { value: "sales", label: "المبيعات", icon: <ShoppingBag className="h-3.5 w-3.5" /> },
                    { value: "orders", label: "الطلبات", icon: <Archive className="h-3.5 w-3.5" /> },
                    { value: "products", label: "المنتجات", icon: <BarChart2 className="h-3.5 w-3.5" /> },
                  ]}
                  className="w-full bg-canvas/60"
                />
              </div>

              {activeReportTab === "pnl" && (
                /* ===== ١ — ملخص الأرباح والخسائر ===== */
                <section className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
                  <div className="p-3 bg-info-soft border border-info/10 rounded-lg text-xs font-semibold text-info flex items-center gap-1.5 w-full">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>أساس نقدي: يتم احتساب الإيرادات والمصاريف بناءً على المقبوضات والمدفوعات النقدية الفعلية فقط.</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <SectionTitle>
                      <span className="flex items-center gap-2">
                        {isProfit ? (
                          <TrendingUp className="h-4 w-4 text-info" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-alert" />
                        )}
                        ملخص الأرباح والخسائر (P&L)
                      </span>
                    </SectionTitle>
                    <DownloadBtn type="pnl" title="الأرباح والخسائر" downloadingId={downloadingId} onDownload={handleDownload} />
                  </div>

                  {/* بطاقة صافي الربح */}
                  <div className={`p-5 rounded-lg border ${isProfit ? "border-info/30 bg-info-soft" : "border-alert/30 bg-alert-soft"}`}>
                    <p className="text-xs font-bold text-ink/60 mb-1.5">صافي الأرباح / الخسائر الإجمالية</p>
                    <p className={`text-3xl font-bold flex items-baseline gap-1 ${isProfit ? "text-info" : "text-alert"}`}>
                      <span className="font-mono text-2xl">{isProfit ? "+" : "−"}</span>
                      <AmountText amount={Math.abs(net)} />
                    </p>
                    <p className="text-[11px] text-ink/50 mt-1.5 flex justify-between items-center flex-wrap gap-1">
                      <span>المبيعات ناقصاً المشتريات والمصاريف التشغيلية</span>
                      {data.pnl.salesCents > 0 && (
                        <span className="font-bold">
                          هامش الربح: {((net / data.pnl.salesCents) * 100).toFixed(1)}%
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                      label="إجمالي المبيعات"
                      amount={data.pnl.salesCents}
                      sub="مجموع الإيرادات الواردة"
                      icon={ShoppingBag}
                      colorClass="text-info"
                      sign="+"
                    />
                    <StatCard
                      label="إجمالي المشتريات"
                      amount={data.pnl.purchasesCents}
                      sub="تكاليف المواد الخام"
                      icon={ShoppingCart}
                      colorClass="text-alert"
                      sign="−"
                    />
                    <StatCard
                      label="إجمالي المصاريف"
                      amount={data.pnl.expensesCents}
                      sub="المصاريف التشغيلية والرواتب"
                      icon={ArrowDownRight}
                      colorClass="text-alert"
                      sign="−"
                    />
                  </div>
                </section>
              )}

              {activeReportTab === "expenses" && (
                /* ===== ٢ — فئات المصاريف ===== */
                <section className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionTitle>
                      <span className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-alert" />
                        توزيع المصاريف حسب الفئة
                      </span>
                    </SectionTitle>
                    <DownloadBtn type="expenses" title="فئات المصاريف" downloadingId={downloadingId} onDownload={handleDownload} />
                  </div>

                  {data.expensesByCategory.length === 0 ? (
                    <p className="text-sm text-ink/45 text-center py-6">لا توجد مصاريف مسجّلة بعد</p>
                  ) : (
                    <div className="flex flex-col md:flex-row items-center gap-8">
                      {/* Donut SVG */}
                      <div className="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
                          {(() => {
                            let cumulativePct = 0;
                            return data.expensesByCategory.map((cat, i) => {
                              const dash = (cat.pct / 100) * 251.2;
                              const offset = (cumulativePct / 100) * 251.2;
                              cumulativePct += cat.pct;
                              return (
                                <circle
                                  key={cat.category}
                                  cx="50"
                                  cy="50"
                                  r="40"
                                  fill="none"
                                  stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                                  strokeWidth="12"
                                  strokeDasharray={`${dash} 251.2`}
                                  strokeDashoffset={-offset}
                                  className="transition-all duration-300"
                                />
                              );
                            });
                          })()}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[10px] text-ink/50 font-bold">المصاريف</span>
                          <span className="text-xs font-bold text-ink truncate max-w-[100px] text-center">
                            <AmountText amount={data.pnl.expensesCents} />
                          </span>
                        </div>
                      </div>

                      {/* Legend & Progress Bars */}
                      <div className="flex-1 w-full space-y-3">
                        {data.expensesByCategory.map((cat, i) => (
                          <div key={cat.category} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-ink/85 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                {cat.category}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-ink/45">{cat.count} حركة</span>
                                <span className="font-bold text-alert">
                                  <AmountText amount={cat.totalCents} />
                                </span>
                                <span className="text-xs text-ink/40 w-10 text-end">
                                  {cat.pct.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                            <ProgressBar pct={cat.pct} style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeReportTab === "sales" && (
                /* ===== ٣ — مصادر المبيعات ===== */
                <section className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <SectionTitle>
                      <span className="flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-info" />
                        مصادر المبيعات والإيرادات
                      </span>
                    </SectionTitle>
                    <DownloadBtn type="sales" title="مصادر المبيعات" downloadingId={downloadingId} onDownload={handleDownload} />
                  </div>

                  {data.salesBySource.length === 0 ? (
                    <p className="text-sm text-ink/45 text-center py-6">لا توجد مبيعات مسجّلة بعد</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {data.salesBySource.map((src) => (
                        <div key={src.source} className="p-4 border border-hairline rounded-lg bg-canvas space-y-2">
                          <p className="text-xs font-bold text-ink/65">{src.label}</p>
                          <p className="text-xl font-bold text-info">
                            <AmountText amount={src.totalCents} />
                          </p>
                          <div className="flex items-center justify-between text-xs text-ink/45">
                            <span>{src.count} عملية</span>
                            <span>{src.pct.toFixed(1)}% من المبيعات</span>
                          </div>
                          <ProgressBar pct={src.pct} colorClass="bg-info" />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeReportTab === "orders" && (
                /* ===== ٤ — حالة الطلبات ===== */
                <section className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
                  <div className="p-3 bg-canvas border border-hairline rounded-lg text-xs font-semibold text-ink-3 flex items-center gap-1.5 w-full">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>أرقام تقديرية — لا تُمثّل نقداً مُحصَّلاً</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <SectionTitle>
                      <span className="flex items-center gap-2">
                        <BarChart2 className="h-4 w-4 text-ink/60" />
                        توزيع الطلبات حسب الحالة
                      </span>
                    </SectionTitle>
                    <DownloadBtn type="orders" title="حالة الطلبات" downloadingId={downloadingId} onDownload={handleDownload} />
                  </div>

                  {data.ordersByStatus.length === 0 ? (
                    <p className="text-sm text-ink/45 text-center py-6">لا توجد طلبات مسجّلة بعد</p>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {data.ordersByStatus.map((row) => (
                        <div key={row.status} className="flex items-center gap-4 py-3">
                          <span className={`px-2.5 py-1 rounded text-[11px] font-bold border flex-shrink-0 ${STATUS_COLORS[row.status] ?? "bg-canvas text-ink/60 border-hairline"}`}>
                            {row.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <ProgressBar pct={row.pct} colorClass={
                              row.status === "delivered" ? "bg-info" :
                              row.status === "confirmed" ? "bg-info/80" :
                              row.status === "sent" ? "bg-info/60" :
                              row.status === "draft" ? "bg-warn" : "bg-alert"
                            } />
                          </div>
                          <span className="text-xs text-ink/45 w-8 text-end flex-shrink-0">
                            {row.count}
                          </span>
                          <span className="text-sm font-bold text-ink-2 w-36 text-end flex-shrink-0 flex items-center justify-end gap-1.5">
                            <AmountText amount={row.totalCents} />
                            <span className="text-[10px] bg-ink/10 text-ink-2 px-1 rounded font-normal shrink-0">تقديري</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeReportTab === "products" && (
                /* ===== ٥ — أكثر المنتجات طلباً ===== */
                <section className="bg-paper rounded-lg border border-hairline shadow-sm p-5 space-y-4">
                  <div className="p-3 bg-canvas border border-hairline rounded-lg text-xs font-semibold text-ink-3 flex items-center gap-1.5 w-full">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>أرقام تقديرية — لا تُمثّل نقداً مُحصَّلاً</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <SectionTitle>
                      <span className="flex items-center gap-2">
                        <Archive className="h-4 w-4 text-ink/60" />
                        أكثر المنتجات طلباً (قيمة تقديرية)
                      </span>
                    </SectionTitle>
                    <DownloadBtn type="products" title="أكثر المنتجات طلباً" downloadingId={downloadingId} onDownload={handleDownload} />
                  </div>

                  {data.topProducts.length === 0 ? (
                    <p className="text-sm text-ink/45 text-center py-6">لا توجد طلبات مسجّلة بعد</p>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {data.topProducts.map((product, idx) => (
                        <div key={product.name} className="flex items-center gap-3 py-3">
                          <span className="text-sm font-bold text-ink/25 w-6 text-center flex-shrink-0">
                            {idx + 1}
                          </span>
                          <span className="flex-1 min-w-0 text-sm font-semibold text-ink/85 truncate">
                            {product.name}
                          </span>
                          <span className="text-xs text-ink/45 flex-shrink-0">
                            {product.orderCount} طلب · {product.totalQty} قطعة
                          </span>
                          <span className="text-sm font-bold text-ink-2 flex-shrink-0 flex items-center gap-1.5">
                            <AmountText amount={product.revenueCents} />
                            <span className="text-[10px] bg-ink/10 text-ink-2 px-1 rounded font-normal shrink-0">تقديري</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )
        ) : (
          <div className="bg-paper p-5 rounded-lg border border-hairline shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-info" />
                  ميزان الوضع المالي (الميزانية العمومية)
                </h3>
                <p className="text-xs text-ink/50 mt-1">عرض الأصول والالتزامات وحقوق الملكية للورشة في تاريخ محدد (أساس نقدي مبسط)</p>
              </div>
              <DownloadBtn
                type="balance_sheet"
                title="الوضع المالي"
                downloadingId={downloadingId}
                onDownload={handleDownload}
              />
            </div>
            
            {positionLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-info" />
              </div>
            ) : !positionData ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <p className="text-sm text-ink/60">تعذر تحميل بيانات الوضع المالي.</p>
                <Button
                  onClick={() => void refetchPosition()}
                  variant="ink"
                  size="sm"
                  icon={<RefreshCw className="h-4 w-4" />}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-medium">
                  {/* الأصول Assets */}
                  <div className="bg-canvas/40 p-4 rounded-lg border border-hairline space-y-4">
                    <h4 className="text-sm font-bold text-info border-b border-hairline pb-2 flex items-center gap-1.5">
                      <TrendingUp className="h-4.5 w-4.5 text-info" />
                      الأصول (الموجودات)
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">نقدية الصندوق</span>
                        <span className="font-mono font-bold text-ink">
                          <AmountText amount={positionData.assets.cashCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">أرصدة البنك</span>
                        <span className="font-mono font-bold text-ink">
                          <AmountText amount={positionData.assets.bankCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-hairline font-bold text-info">
                        <span>إجمالي الأصول</span>
                        <span className="font-mono">
                          <AmountText amount={positionData.assets.totalCents} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* الالتزامات Liabilities */}
                  <div className="bg-canvas/40 p-4 rounded-lg border border-hairline space-y-4">
                    <h4 className="text-sm font-bold text-alert border-b border-hairline pb-2 flex items-center gap-1.5">
                      <ArrowDownRight className="h-4.5 w-4.5 text-alert" />
                      الالتزامات (المطالبات)
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">عربونات مؤجلة (غير موصلة)</span>
                        <span className="font-mono font-bold text-ink">
                          <AmountText amount={positionData.liabilities.depositsCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-hairline font-bold text-alert">
                        <span>إجمالي الالتزامات</span>
                        <span className="font-mono">
                          <AmountText amount={positionData.liabilities.totalCents} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* حقوق الملكية Equity */}
                  <div className="bg-canvas/40 p-4 rounded-lg border border-hairline space-y-4">
                    <h4 className="text-sm font-bold text-ink border-b border-hairline pb-2 flex items-center gap-1.5">
                      <Wallet className="h-4.5 w-4.5 text-ink-3" />
                      حقوق الملكية (رأس المال والأرباح)
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">نقدية البداية (رأس المال الفعلي)</span>
                        <span className="font-mono font-bold text-ink">
                          <AmountText amount={positionData.equity.openingCashInEquityCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-ink/45 pb-1 border-b border-dashed border-hairline">
                        <span>رأس المال المصرح به (مرجعي)</span>
                        <span className="font-mono">
                          <AmountText amount={positionData.equity.openingCapitalCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">إيداعات إضافية للمالك</span>
                        <span className="font-mono font-bold text-info">
                          +<AmountText amount={positionData.equity.injectionsCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">مسحوبات شخصية للمالك</span>
                        <span className="font-mono font-bold text-alert">
                          -<AmountText amount={positionData.equity.drawingsCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink/65 font-medium">أرباح مدورة محتجزة</span>
                        <span className="font-mono font-bold text-ink">
                          <AmountText amount={positionData.equity.retainedProfitCents} />
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm pt-2 border-t border-hairline font-bold text-ink">
                        <span>إجمالي حقوق الملكية</span>
                        <span className="font-mono">
                          <AmountText amount={positionData.equity.totalCents} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* تأكيد التوازن المحاسبي */}
                {positionData.balanced ? (
                  <div className="p-4 bg-info/10 border border-info/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-semibold text-info-dark">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-info animate-pulse" />
                      المعادلة متوازنة محاسبياً: الأصول = الالتزامات + حقوق الملكية
                    </span>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono">
                      <span>الأصول: <AmountText amount={positionData.assets.totalCents} /></span>
                      <span>المطلوبات وحقوق الملكية: <AmountText amount={positionData.liabilities.totalCents + positionData.equity.totalCents} /></span>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-alert/10 border border-alert/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-semibold text-alert">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-alert animate-pulse" />
                      تنبيه: انحراف محاسبي قدره <AmountText amount={Math.abs(positionData.equityDriftCents)} />
                    </span>
                    <span className="text-xs">يرجى مراجعة الحركات المالية أو الاتصال بالدعم.</span>
                  </div>
                )}

                {/* تسوية متقدمة مع قائمة الدخل */}
                <div className="mt-4 border border-hairline rounded-lg overflow-hidden bg-paper shadow-sm">
                  <details className="group">
                    <summary className="p-4 bg-canvas/30 hover:bg-canvas/50 text-xs font-bold text-ink/75 flex items-center justify-between cursor-pointer select-none transition-colors">
                      <span className="flex items-center gap-2">
                        <span>تفاصيل المطابقة المتقدمة (تسوية الدفتر والقوائم)</span>
                      </span>
                      <span className="transition-transform group-open:rotate-180 text-ink/40">▼</span>
                    </summary>
                    <div className="p-5 bg-paper text-xs space-y-5 border-t border-hairline leading-relaxed text-ink/80">
                      {/* التسوية الداخلية للميزانية */}
                      <div className="space-y-2.5">
                        <h5 className="font-bold text-ink border-b border-hairline pb-2 flex items-center justify-between">
                          <span>1. تسوية توازن الأرباح المدورة (رصيد الميزانية)</span>
                          {positionData.pnlReconciliationCents === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-info/10 text-info border border-info/20">تطابق مالي ✓</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-alert/10 text-alert border border-alert/20">فرق محاسبي ⚠</span>
                          )}
                        </h5>
                        <div className="flex justify-between text-ink/75">
                          <span>الأرباح المحتجزة المترتبة في الميزانية:</span>
                          <span className="font-mono"><AmountText amount={positionData.equity.retainedProfitCents} /></span>
                        </div>
                        <div className="flex justify-between text-ink/75">
                          <span>صافي الأرباح النقدي (النشط) بعد خصم الالتزام:</span>
                          <span className="font-mono"><AmountText amount={positionData.pnlAllTimeNetCents - positionData.liabilities.depositsCents} /></span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-hairline pt-2 font-bold">
                          <span>فرق المطابقة الداخلي:</span>
                          <span className={positionData.pnlReconciliationCents === 0 ? "text-info font-mono" : "text-alert font-mono"}>
                            <AmountText amount={positionData.pnlReconciliationCents} />
                          </span>
                        </div>
                      </div>

                      {/* تسوية الدفتر المالي مع الجداول المصدرية */}
                      <div className="space-y-2.5 pt-3 border-t border-hairline">
                        <h5 className="font-bold text-ink border-b border-hairline pb-2 flex items-center justify-between">
                          <span>2. تسوية تطابق الدفتر النقدي (Ledger) مع الجداول المصدرية</span>
                          {positionData.pnlSourceReconciliationCents === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-info/10 text-info border border-info/20">سليم ومطابق ✓</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-alert/10 text-alert border border-alert/20">انحراف غير مطابق ⚠</span>
                          )}
                        </h5>
                        <div className="flex justify-between text-ink/75">
                          <span>صافي الأرباح من الدفتر النقدي (Ledger Net Profit):</span>
                          <span className="font-mono"><AmountText amount={positionData.ledgerPnlNetCents} /></span>
                        </div>
                        <div className="flex justify-between text-ink/75">
                          <span>صافي الأرباح من الجداول المصدرية (Source Tables Net Profit):</span>
                          <span className="font-mono"><AmountText amount={positionData.sourceTablePnlNetCents} /></span>
                        </div>
                        <div className="flex justify-between border-t border-dashed border-hairline pt-2 font-bold">
                          <span>فرق تسوية الدفتر والمصدر (Drift):</span>
                          <span className={positionData.pnlSourceReconciliationCents === 0 ? "text-info font-mono" : "text-alert font-mono"}>
                            <AmountText amount={positionData.pnlSourceReconciliationCents} />
                          </span>
                        </div>
                        {positionData.pnlSourceReconciliationCents !== 0 && (
                          <div className="p-3 rounded-md bg-alert-soft border border-alert/15 text-[11px] text-alert font-sans leading-relaxed mt-2 flex items-start gap-2">
                            <span className="mt-0.5">⚠️</span>
                            <span>تنبيه: يوجد عدم تطابق بين حركات الصندوق والبنك والبيانات المصدرية للمبيعات/المشتريات/المصاريف. يرجى التحقق من وجود حركات مفقودة أو محذوفة.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            )}

            {/* لوحة الفحص المالي الدوري */}
            <IntegrityCheckReportPanel />
          </div>
        )}
      </div>
    </>
  );
}
