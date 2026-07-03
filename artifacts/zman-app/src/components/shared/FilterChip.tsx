"use client";
import React from "react";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  count?: number;
  variant?: "pill" | "rectangle";
  className?: string;
}

export function FilterChip({
  label,
  isActive,
  onClick,
  count,
  variant = "pill",
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 px-4 transition-all duration-150 select-none whitespace-nowrap active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 text-xs font-semibold border",
        variant === "pill"
          ? "rounded-full h-9 min-h-[44px]"
          : "rounded-md h-11",
        isActive
          ? "bg-info text-paper border-info shadow-sm"
          : "bg-paper text-ink-2 border-hairline hover:bg-canvas hover:text-ink",
        className
      )}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] leading-none font-bold",
            isActive ? "bg-paper text-info" : "bg-canvas text-ink-3"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
