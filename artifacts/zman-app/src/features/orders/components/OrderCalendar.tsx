"use client";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AmountText } from "@/components/shared/AmountText";
import { cn } from "@/lib/utils";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { useOrderDatesForMonth, useOrders } from "../hooks";
import type { Order } from "../types";

// ── أسماء عربية ─────────────────────────────────────────────────
const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const ARABIC_DAYS_SHORT = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

import { STATUS_LABELS } from "@/lib/status-colors";

// ── دوال مساعدة ──────────────────────────────────────────────────

/** يُرجع "YYYY-MM-DD" بالتوقيت المحلي للمتصفح */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** اسم اليوم الكامل بالعربية */
function formatArabicDayFull(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayNames = [
    "الأحد",
    "الإثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
  ];
  return `${dayNames[date.getDay()]} ${d} ${ARABIC_MONTHS[m - 1]} ${y}`;
}

/** يبني مصفوفة خلايا التقويم (null = خلية فارغة) */
function buildCalendarCells(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cells: (Date | null)[] = [];

  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

// ── مكوّن لوحة الطلبات اليومية ───────────────────────────────────

interface DayOrdersPanelProps {
  dateStr: string;
  status: string;
  q: string;
  onClose: () => void;
  onViewDetail: (order: Order) => void;
  onCreateNew: () => void;
}

function DayOrdersPanel({ dateStr, status, q, onClose, onViewDetail, onCreateNew }: DayOrdersPanelProps) {
  const { data, isLoading } = useOrders({ date: dateStr, status, q, limit: 50 });
  const orders = data?.items ?? [];

  return (
    <>
      {/* طبقة شفافة خلف اللوحة */}
      <div
        className="fixed inset-0 z-sheet bg-ink/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* اللوحة نفسها — تظهر من الأسفل */}
      <div className="fixed inset-x-0 bottom-0 z-sheet bg-paper rounded-t-2xl shadow-xl border-t border-hairline max-h-[70vh] flex flex-col lg:static lg:rounded-lg lg:border lg:mt-4 lg:max-h-none lg:shadow-sm">
        {/* رأس اللوحة */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0">
          <h3 className="text-base font-bold text-ink">
            {formatArabicDayFull(dateStr)}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-canvas text-ink-3 hover:text-ink transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* قائمة الطلبات */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-4">
              <SkeletonList count={3} />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-3">
              لا توجد طلبات في هذا اليوم
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {orders.map((ord) => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => onViewDetail(ord)}
                  className="w-full text-start px-5 py-4 hover:bg-canvas transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-sm truncate">{ord.customerName}</p>
                    <p className="text-xs text-ink-3 mt-0.5 truncate">{ord.productName}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm font-bold text-info">
                      <AmountText amount={ord.totalPriceCents} />
                    </p>
                    <span className="text-xs text-ink-3">
                      {STATUS_LABELS[ord.status] ?? ord.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* زر الإضافة */}
        <div className="px-5 py-4 border-t border-hairline shrink-0">
          <button
            type="button"
            onClick={onCreateNew}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-info hover:bg-info/90 text-paper font-bold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            إضافة طلب جديد
          </button>
        </div>
      </div>
    </>
  );
}

// ── المكوّن الرئيسي ───────────────────────────────────────────────

interface OrderCalendarProps {
  onViewDetail: (order: Order) => void;
  onCreateNew: () => void;
}

export function OrderCalendar({ onViewDetail, onCreateNew }: OrderCalendarProps) {
  const today = new Date();
  const searchParams = useSearchParams();
  // الفلاتر المشتركة من هيدر الصفحة (تؤثر على لوحة اليوم)
  const status = searchParams.get("status") || "all";
  const q = searchParams.get("q") || "";

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const todayStr = toLocalDateString(today);

  // جلب أيام الشهر التي تحتوي على طلبات (month+1 لأن DB يتوقع 1-indexed)
  const { data: orderDates = {} } = useOrderDatesForMonth(year, month + 1);

  const cells = buildCalendarCells(year, month);

  const prevMonth = () => {
    setSelectedDate(null);
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };

  const nextMonth = () => {
    setSelectedDate(null);
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleDayClick = (date: Date) => {
    const str = toLocalDateString(date);
    setSelectedDate((prev) => (prev === str ? null : str));
  };

  return (
    <div className="space-y-4">
      {/* ── التقويم ── */}
      <div className="bg-paper rounded-xl border border-hairline shadow-sm overflow-hidden">

        {/* رأس الشهر */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-canvas">
          {/* في RTL: ▶ تعني "السابق" (تتحرك يميناً) */}
          <button
            type="button"
            onClick={nextMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-hairline text-ink-2 transition-colors"
            aria-label="الشهر التالي"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <span className="text-base font-bold text-ink select-none">
            {ARABIC_MONTHS[month]} {year}
          </span>

          <button
            type="button"
            onClick={prevMonth}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-hairline text-ink-2 transition-colors"
            aria-label="الشهر السابق"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* رؤوس أيام الأسبوع */}
        <div className="grid grid-cols-7 border-b border-hairline">
          {ARABIC_DAYS_SHORT.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-bold text-ink-3 py-2.5"
            >
              {day}
            </div>
          ))}
        </div>

        {/* خلايا الأيام */}
        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            if (!date) {
              return <div key={`empty-${i}`} className="min-h-[52px]" />;
            }

            const dateStr = toLocalDateString(date);
            const isToday = dateStr === todayStr;
            const dayInfo = orderDates[dateStr];
            const dayStatuses = dayInfo?.statuses ?? [];
            const dayCount = dayInfo?.count ?? 0;
            const hasOrders = dayStatuses.length > 0;
            const isSelected = dateStr === selectedDate;

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => handleDayClick(date)}
                className={cn(
                  "relative flex flex-col items-center justify-center min-h-[52px] transition-colors focus:outline-none focus:ring-2 focus:ring-info focus:ring-inset",
                  isSelected
                    ? "bg-info"
                    : isToday
                      ? "bg-info-soft hover:bg-info-soft"
                      : "hover:bg-canvas",
                )}
              >
                <span
                  className={cn(
                    "text-sm font-medium leading-none",
                    isSelected
                      ? "text-paper font-bold"
                      : isToday
                        ? "text-info font-bold"
                        : "text-ink",
                  )}
                >
                  {date.getDate()}
                </span>

                {/* شارة عدد الطلبات في اليوم (زاوية الخلية) */}
                {dayCount > 0 && (
                  <span
                    className={cn(
                      "absolute top-1 end-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none tabular-nums",
                      isSelected
                        ? "bg-paper/90 text-info"
                        : "bg-info text-paper",
                    )}
                  >
                    {dayCount}
                  </span>
                )}

                {/* نقاط حالات الطلبات */}
                {hasOrders && (
                  <div className="flex gap-0.5 mt-1 justify-center">
                    {dayStatuses.includes("delivered") && (
                      <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-paper/85" : "bg-emerald")} />
                    )}
                    {dayStatuses.includes("confirmed") && (
                      <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-paper/70" : "bg-info")} />
                    )}
                    {dayStatuses.includes("sent") && (
                      <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-paper/55" : "bg-info/60")} />
                    )}
                    {dayStatuses.includes("draft") && (
                      <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-paper/80" : "bg-warn")} />
                    )}
                    {dayStatuses.includes("cancelled") && (
                      <div className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-paper/80" : "bg-alert")} />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* مفتاح الألوان — يشرح كل حالات الطلبات */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 px-1 text-xs text-ink-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-warn" />
          <span>مقترح</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-info/60" />
          <span>تم التأكيد</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-info" />
          <span>تحت التنفيذ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald" />
          <span>تم التسليم</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-alert" />
          <span>ملغى</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="min-w-[16px] h-4 px-1 rounded-full bg-info text-paper text-[9px] font-bold flex items-center justify-center leading-none">3</span>
          <span>عدد الطلبات</span>
        </div>
      </div>

      {/* لوحة الطلبات اليومية */}
      {selectedDate && (
        <DayOrdersPanel
          dateStr={selectedDate}
          status={status}
          q={q}
          onClose={() => setSelectedDate(null)}
          onViewDetail={(ord) => {
            setSelectedDate(null);
            onViewDetail(ord);
          }}
          onCreateNew={() => {
            setSelectedDate(null);
            onCreateNew();
          }}
        />
      )}
    </div>
  );
}
