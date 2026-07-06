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
        "flex items-center rounded-lg border border-hairline bg-canvas p-1 gap-0.5 overflow-x-auto no-scrollbar whitespace-nowrap",
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
              "flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-[120ms] ease-out active:scale-[0.94]",
              compact
                ? "min-h-[36px] h-9 px-3.5 rounded-md"
                : "min-h-[44px] h-11 px-3 rounded-md flex-1",
              isActive
                ? "bg-info text-paper shadow-sm"
                : "text-ink-3 hover:text-ink hover:bg-paper/60"
            )}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            {/* النص: يُخفى على الجوال فقط إن وُجدت أيقونة تنوب عنه؛
                وإن لم تكن هناك أيقونة، يظهر النص دائماً (وإلا يصير الزر فارغاً) */}
            {opt.label && (
              <span className={opt.icon ? "hidden sm:inline" : ""}>
                {opt.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
