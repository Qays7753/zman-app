"use client";

import { cn } from "@/lib/utils";
import React from "react";

interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // للوصول (aria-label + title)
  isActive?: boolean; // حالة نشطة (قائمة مفتوحة / فلتر مطبّق)
  badge?: boolean; // نقطة تشير لوجود فلتر مفعّل
  /**
   * شكل الزر:
   *   - "icon" (الافتراضي): زر مربّع 44×44 بحافة كاملة._byte-identical مع
   *     الإصدار السابق — أيّ تغيير هنا يكسر PageToolbar (بحث/فلتر/إعدادات).
   *   - "tab": زر تبويب بنفس لغة "icon" (إطار + خلفية + نصف قطر) لكن
   *     بعرض 60px كحدّ أدنى ليتّسع للنص، وأيقونة 16px فوق نص 11px.
   *     (60 لا 68: ثلاثة تبويبات + بحث + فلتر + الفواصل = 336px المتاحة
   *     على شاشة 360px بالضبط — 68 كانت تفيض 8px.)
   *
   *     لماذا لا نُطابق شريط التنقل السفلي حرفياً: ذاك في شريط h-16 (64px)
   *     فتتنفّس فيه أيقونة 20px مع نص. الهيدر h-14 (56px) والزر 44px — نفس
   *     المقاسات تختنق هنا. لذلك أيقونة 16px و gap-px بدل gap-0.5.
   *
   *     الحالة النشطة تأخذ نفس مظهر "icon" النشط (إطار info + خلفية
   *     info-soft) وتزيد شريطاً سفلياً 2px — فيبقى التمييز قائماً حتى مع
   *     تجاهل اللون (شمس / عمى ألوان)، ويبقى الصفّ متجانساً بصرياً.
   */
  variant?: "icon" | "tab";
  /** tone يميز الإجراء الثانوي عن زر الفلترة أو الإجراء الأساسي */
  tone?: "default" | "quiet" | "primary";
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
>(
  (
    {
      label,
      isActive = false,
      badge = false,
      variant = "icon",
      tone = "default",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isTab = variant === "tab";
    return (
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        className={cn(
          isTab
            ? "relative h-11 min-h-[44px] min-w-[60px] px-2 rounded-lg border flex flex-col items-center justify-center gap-px leading-none shrink-0 transition-all duration-[120ms] ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            : "relative w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg border flex items-center justify-center shrink-0 transition-all duration-[120ms] ease-out active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          // النشط: نفس لغة الأدوات (إطار + خلفية info-soft) — والتبويب يزيد
          // عليها شريطاً سفلياً 2px ليبقى مميَّزاً حتى لو تجاهلنا اللون.
          isActive
            ? isTab
              ? "border-brand bg-brand-soft text-brand border-b-2 font-bold"
              : "border-brand bg-brand-soft text-brand"
            : tone === "quiet" && !isTab
              ? "border-transparent bg-transparent text-ink-2 hover:text-ink hover:bg-canvas"
              : tone === "primary" && !isTab
                ? "border-brand bg-brand text-paper hover:bg-brand-deep"
                : "border-hairline bg-paper text-ink-2 hover:text-ink hover:bg-canvas",
          className,
        )}
        {...props}
      >
        {children}
        {isTab && <span className="text-[11px] leading-tight">{label}</span>}
        {!isTab && badge && !isActive && (
          <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-brand ring-2 ring-paper" />
        )}
      </button>
    );
  },
);

HeaderIconButton.displayName = "HeaderIconButton";
