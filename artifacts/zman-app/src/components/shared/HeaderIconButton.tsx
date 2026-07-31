"use client";

import { cn } from "@/lib/utils";
import React from "react";

interface HeaderIconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // للوصول (aria-label + title)
  isActive?: boolean; // حالة نشطة (قائمة مفتوحة / فلتر مطبّق)
  badge?: boolean; // نقطة تشير لوجود فلتر مفعّل
  /**
   * شكل الزر:
   *   - "icon" (الافتراضي): زر مربّع 44×44 بحافة كاملة._byte-identical مع
   *     الإصدار السابق — أيّ تغيير هنا يكسر PageToolbar (بحث/فلتر/إعدادات).
   *   - "tab": زر تبويب بعرض مرن بمحتوى-مُحرَّك، بحد أدنى 44×44، بلا حشوة
   *     أفقية وبلا حاوية حدود — مطابق لنمط شريط التنقل السفلي في AppShell.tsx
   *     (أيقونة + نص 11px + شريط سفلي 2px).
   */
  variant?: "icon" | "tab";
}

/**
 * زر أيقونة موحّد لهيدر الصفحات (بحث/فلتر/إعدادات/تبويبات...).
 * 44px هدف لمس، حواف موحّدة، حالة نشطة، ونقطة إشعار اختيارية (للأيقونة فقط).
 *
 * عند إضافة أيّ تغيير على `variant="icon"`: يجب أن يبقى byte-identical مع
 * الإصدار السابق — PageToolbar يعتمد على هذا الوضع لكل أزراره.
 */
export const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  HeaderIconButtonProps
>(({ label, isActive = false, badge = false, variant = "icon", className, children, ...props }, ref) => {
  const isTab = variant === "tab";
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        isTab
          ? "relative min-h-[44px] min-w-[44px] rounded-lg flex flex-col items-center justify-center gap-0.5 shrink-0 transition-all duration-[120ms] ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          : "relative w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center shrink-0 transition-all duration-[120ms] ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info",
        isActive
          ? isTab
            ? "text-info border-b-2 border-info"
            : "border-info bg-info-soft text-info"
          : isTab
            ? "text-ink-2 hover:text-ink border-b-2 border-transparent"
            : "border-hairline bg-paper text-ink-2 hover:text-ink hover:bg-canvas",
        className,
      )}
      {...props}
    >
      {children}
      {isTab && (
        <span className="text-[11px] leading-tight">{label}</span>
      )}
      {!isTab && badge && !isActive && (
        <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-info ring-2 ring-paper" />
      )}
    </button>
  );
});

HeaderIconButton.displayName = "HeaderIconButton";
