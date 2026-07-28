"use client";

import { Info } from "lucide-react";
import { useState, useId } from "react";

/**
 * أيقونة (i) صغيرة تعرض نصاً توضيحياً عند النقر/التحويم.
 * للمستخدم الذي يريد معرفة المزيد دون إغراق الشاشة بالشروحات.
 *
 * SA2 (Round 4 — B-2 fix): منطقة اللمس الآن 44×44 px (لا 14×14) عبر padding
 * داخلي + margin سالب، فالأيقونة تبقى 14 px بصرياً لكن الزر يحقّق معيار اللمس
 * الأدنى للوصول. الـ tooltip body مُرتكِز بـ `end-0` (logical) لا `right-0`
 * (physical) — راجع قاعدة RTL في design-baseline.md. كما يُقيَّد عرض الـ tooltip
 * بـ `max-w-[calc(100vw-2rem)]` لمنع الخروج عن الشاشة على أجهزة 360 px.
 *
 * SA2 (Round 4 — Part C item 9 accessibility floor): aria-describedby + role="tooltip"
 * + Escape-for-dismiss + focus management. لا يزال النقر/التحويم يعمل كما كان.
 */
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="text-ink/30 hover:text-info transition-colors min-h-[44px] min-w-[44px] -m-3 p-3 inline-flex items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
        aria-label="مزيد من المعلومات"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5 pointer-events-none" />
      </button>
      {open && (
        <span
          id={tooltipId}
          className="absolute bottom-full end-0 mb-1 z-50 w-56 max-w-[calc(100vw-2rem)] p-2.5 rounded-lg bg-ink text-paper text-[11px] leading-relaxed shadow-lg whitespace-normal"
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
