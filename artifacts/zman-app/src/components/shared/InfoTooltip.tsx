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
 *
 * SA-A (Round 5 — R5-1 fix): إصلاح قص الشاشة على الجوال. القاعدة القديمة
 * `absolute end-0 w-56` كانت تُثبّت الحافة الطرفية للـ popup على الـ trigger،
 * فيمتد جسم 224px خارج الشاشة — 66px مقصوص على 390px وأسوأ على 360px
 * (10 من 12 tooltip مقصوصة على كل من العرضين). على الجوال (< sm) أصبح الـ
 * popup مثبّتاً على إطار العرض: `fixed start-4 end-4 bottom-20` يحصر كلا
 * الطرفين بـ 16px من حافة العرض، فيصبح العرض = vw − 32 و rect.left = 16
 * و rect.right = vw − 16 لأي موضع للـ trigger. z-50 يعلو فوق الزر العائم
 * (z-dropdown=20). على الكمبيوتر (sm+) نبقى على القاعدة القديمة — الـ
 * tooltips قصيرة والعرض كبير، فـ end-0 صحيحة هناك.
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
          className={[
            // Mobile (< sm): viewport-anchored, full width minus 16px margins,
            // positioned above the bottom nav. Survives a trigger at either
            // edge — the previous `end-0` anchor let the 224px popup extend
            // past the viewport edge on 360/390px (66px off-screen at 390px).
            "fixed start-4 end-4 bottom-20 mb-1 z-50 w-auto max-w-none",
            // sm+: keep the existing absolute-end-anchored popup. Tooltips
            // are short and the desktop viewport is wide, so end-0 is correct.
            "sm:absolute sm:start-auto sm:end-0 sm:bottom-full sm:w-56 sm:max-w-[calc(100vw-2rem)]",
            "p-2.5 rounded-lg bg-ink text-paper text-[11px] leading-relaxed shadow-lg whitespace-normal",
          ].join(" ")}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
