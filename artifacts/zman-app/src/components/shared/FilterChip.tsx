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
        "inline-flex items-center justify-center gap-1.5 px-4 transition-colors duration-[120ms] select-none whitespace-nowrap active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 text-sm font-semibold border",
        variant === "pill"
          ? "rounded-full h-12 min-h-12"
          : "rounded-md h-12 min-h-12",
        isActive ? "bg-brand text-paper border-brand"
          : "bg-paper text-ink-2 border-hairline hover:bg-canvas hover:text-ink",
        className
      )}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] leading-none font-bold",
            isActive ? "bg-paper text-brand" : "bg-canvas text-ink-3"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
