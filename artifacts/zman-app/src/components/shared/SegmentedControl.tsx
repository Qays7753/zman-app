"use client";

import { cn } from "@/lib/utils";
import React from "react";

export interface SegmentedOption<T = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** compact = الأزرار بعرض محتواها لا تتمدّد */
  compact?: boolean;
  /** scrollable = يسمح بالتمرير عندما تكون الخيارات أطول من المساحة المتاحة */
  scrollable?: boolean;
  /** underline = تبويب هادئ دون كتلة خضراء، مناسب للمالية والتقارير */
  tone?: "filled" | "underline";
}

export function SegmentedControl<T = string>({
  options,
  value,
  onChange,
  className,
  compact = false,
  scrollable = true,
  tone = "filled",
}: SegmentedControlProps<T>) {
  const isUnderline = tone === "underline";

  return (
    <div
      className={cn(
        isUnderline
          ? compact && !scrollable
            ? "flex items-stretch w-fit whitespace-nowrap overflow-visible"
            : "flex items-stretch border-b border-hairline max-w-full whitespace-nowrap"
          : "flex items-center rounded-lg border border-hairline bg-canvas p-1 gap-0.5 max-w-full whitespace-nowrap",
        scrollable ? "overflow-x-auto no-scrollbar" : compact ? "overflow-visible" : "overflow-hidden w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex items-center justify-center font-bold transition-colors duration-[120ms] ease-out active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              compact && !scrollable ? "gap-1 text-xs" : "gap-1.5 text-sm",
              isUnderline
                ? compact && !scrollable
                  ? "min-h-12 h-12 px-1.5 rounded-none border-b-2 border-transparent flex-none"
                  : "min-h-12 h-12 px-3 rounded-none border-b-2 border-transparent flex-1 min-w-0"
                : compact
                  ? scrollable
                    ? "min-h-12 h-12 px-3.5 rounded-md"
                    : "min-h-12 h-12 px-2 rounded-md flex-1 min-w-0"
                  : "min-h-12 h-12 px-3 rounded-md flex-none min-w-[88px]",
              isActive
                ? isUnderline
                  ? "border-brand-deep text-brand-deep"
                  : "bg-brand text-paper shadow-sm"
                : "text-ink-2 hover:text-ink hover:bg-canvas",
            )}
          >
            {opt.icon && <span className="shrink-0" aria-hidden="true">{opt.icon}</span>}
            {opt.label && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
