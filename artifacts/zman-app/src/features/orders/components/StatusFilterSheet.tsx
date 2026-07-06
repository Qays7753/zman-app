"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Check, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/status-colors";
import { HeaderIconButton } from "@/components/shared/HeaderIconButton";

// لون النقطة/الشارة لكل حالة (متّسق مع STATUS_COLORS)
const STATUS_DOT: Record<string, string> = {
  all: "bg-ink-3",
  draft: "bg-warn",
  sent: "bg-info/70",
  confirmed: "bg-info",
  delivered: "bg-emerald",
  cancelled: "bg-alert",
};

// خلفية الصف النشط لكل حالة (لمسة لونية خفيفة)
const STATUS_ACTIVE_BG: Record<string, string> = {
  all: "bg-canvas border-hairline-2",
  draft: "bg-warn-soft border-warn/30",
  sent: "bg-info-soft border-info/30",
  confirmed: "bg-info-soft border-info/40",
  delivered: "bg-emerald-soft border-emerald/30",
  cancelled: "bg-alert-soft border-alert/30",
};

const STATUS_ORDER = ["all", "draft", "sent", "confirmed", "delivered", "cancelled"];

const SORT_OPTIONS = [
  { value: "newest", label: "الأحدث" },
  { value: "delivery", label: "تاريخ التسليم (الأقرب)" },
  { value: "price_high", label: "السعر (الأعلى)" },
  { value: "price_low", label: "السعر (الأدنى)" },
];

interface StatusFilterSheetProps {
  value: string; // الحالة المختارة حالياً
  counts: Record<string, number>; // عدّاد كل حالة
  onChange: (status: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
}

/**
 * فلتر حالة الطلب الاحترافي — زر في الهيدر يفتح ورقة سفلية (bottom sheet)
 * فيها كل حالة بلونها + عدّاد طلباتها الحيّ، مع تمييز الحالة النشطة.
 * لا يُقصّ أبداً (portal + fixed) وسهل اللمس على الجوال.
 */
export function StatusFilterSheet({
  value,
  counts,
  onChange,
  sort,
  onSortChange,
}: StatusFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // منع تمرير الخلفية أثناء فتح الورقة
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const totalActive = STATUS_ORDER.filter((s) => s !== "all").reduce(
    (sum, s) => sum + (counts[s] ?? 0),
    0,
  );
  const isFiltering = value !== "all";

  const label = (status: string) =>
    status === "all" ? "كل الحالات" : (STATUS_LABELS[status] ?? status);
  const count = (status: string) =>
    status === "all" ? totalActive : (counts[status] ?? 0);

  return (
    <>
      <HeaderIconButton
        label="تصفية الحالة"
        isActive={open}
        badge={isFiltering}
        onClick={() => setOpen(true)}
      >
        <ListFilter className="w-5 h-5" />
      </HeaderIconButton>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-modal flex flex-col justify-end">
            {/* الطبقة الخلفية */}
            <button
              type="button"
              aria-label="إغلاق"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
            />

            {/* الورقة السفلية */}
            <div className="relative bg-paper rounded-t-2xl border-t border-hairline shadow-xl pb-[env(safe-area-inset-bottom)] animate-slide-up">
              {/* مقبض السحب */}
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="w-10 h-1 rounded-full bg-hairline-2" />
              </div>

              {/* رأس الورقة */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-hairline">
                <h3 className="text-base font-bold text-ink">تصفية وترتيب الطلبات</h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="إغلاق"
                  className="min-h-[40px] min-w-[40px] -me-2 flex items-center justify-center rounded-lg text-ink-3 hover:bg-canvas transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* قائمة الحالات والترتيب */}
              <div className="p-3 space-y-4 max-h-[75vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-ink/50 px-1 mb-1">تصفية حسب الحالة</p>
                  {STATUS_ORDER.map((status) => {
                    const active = value === status;
                    const c = count(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          onChange(status);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 min-h-[52px] px-3.5 rounded-xl border text-start transition-all duration-150 active:scale-[0.98]",
                          active
                            ? cn(STATUS_ACTIVE_BG[status], "shadow-sm")
                            : "bg-paper border-hairline hover:bg-canvas",
                        )}
                      >
                        {/* نقطة اللون */}
                        <span
                          className={cn(
                            "w-3 h-3 rounded-full shrink-0 ring-2 ring-paper",
                            STATUS_DOT[status],
                          )}
                        />
                        {/* التسمية */}
                        <span
                          className={cn(
                            "flex-1 text-sm",
                            active ? "font-bold text-ink" : "font-semibold text-ink-2",
                          )}
                        >
                          {label(status)}
                        </span>
                        {/* العدّاد */}
                        <span
                          className={cn(
                            "min-w-[28px] h-6 px-1.5 flex items-center justify-center rounded-full text-xs font-bold tabular-nums",
                            active
                              ? "bg-ink text-paper"
                              : c > 0
                                ? "bg-canvas text-ink-2 border border-hairline"
                                : "text-ink-3",
                          )}
                        >
                          {c}
                        </span>
                        {/* علامة النشط */}
                        {active && <Check className="w-4 h-4 text-ink shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* الترتيب */}
                <div className="border-t border-hairline pt-3">
                  <p className="text-[11px] font-bold text-ink/50 px-1 mb-2">ترتيب الطلبات حسب</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SORT_OPTIONS.map((opt) => {
                      const active = sort === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onSortChange(opt.value);
                            setOpen(false);
                          }}
                          className={cn(
                            "flex items-center justify-between gap-2 min-h-[44px] px-3 rounded-xl border text-[13px] text-start transition-all duration-150 active:scale-[0.98]",
                            active
                              ? "bg-info-soft text-info border-info/30 font-bold shadow-sm"
                              : "bg-paper border-hairline hover:bg-canvas text-ink-2 font-semibold",
                          )}
                        >
                          <span>{opt.label}</span>
                          {active && <Check className="w-4 h-4 text-info shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
