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
  /** compact = الأزرار بعرض محتواها لا تتمدّد (للهيدر المزدحم) */
  compact?: boolean;
}

export function SegmentedControl<T = string>({
  options,
  value,
  onChange,
  className,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "flex items-center rounded-lg border border-hairline bg-canvas p-1 gap-0.5",
        className
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
              "min-h-[44px] h-11 rounded-md flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-[120ms] ease-out active:scale-[0.94]",
              compact ? "px-3.5" : "flex-1 px-3",
              isActive
                ? "bg-info text-paper shadow-sm"
                : "text-ink-3 hover:text-ink hover:bg-paper/60"
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {opt.label && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
