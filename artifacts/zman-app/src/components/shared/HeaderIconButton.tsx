"use client";

import { cn } from "@/lib/utils";
import React from "react";

interface HeaderIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  isActive?: boolean;
  badge?: boolean;
  variant?: "icon" | "tab";
  tone?: "default" | "quiet" | "primary";
}

/**
 * Shared mobile header action. The visible icon can be smaller than the
 * interactive surface, but the button itself remains 48px for touch safety.
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
            ? "relative h-12 min-h-12 min-w-[60px] px-2 rounded-lg border flex flex-col items-center justify-center gap-px leading-none shrink-0 transition-colors duration-[120ms] ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            : "relative h-12 w-12 min-h-12 min-w-12 rounded-lg border flex items-center justify-center shrink-0 transition-colors duration-[120ms] ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
          isActive
            ? isTab
              ? "border-brand-deep bg-brand-soft text-brand-deep border-b-2 font-bold"
              : "border-brand-deep bg-brand-soft text-brand-deep"
            : tone === "quiet" && !isTab
              ? "border-transparent bg-transparent text-ink-2 hover:text-ink hover:bg-canvas"
              : tone === "primary" && !isTab
                ? "border-brand bg-brand text-paper hover:bg-brand-hover"
                : "border-hairline bg-paper text-ink-2 hover:text-ink hover:bg-canvas",
          className,
        )}
        {...props}
      >
        {children}
        {isTab && <span className="text-[11px] leading-tight">{label}</span>}
        {!isTab && badge && !isActive && (
          <span
            className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-paper"
            aria-hidden="true"
          />
        )}
      </button>
    );
  },
);

HeaderIconButton.displayName = "HeaderIconButton";
