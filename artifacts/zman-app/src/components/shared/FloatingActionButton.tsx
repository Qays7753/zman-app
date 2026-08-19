"use client";

import React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingActionButtonProps {
  onClick: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  showLabel?: boolean;
}

export function FloatingActionButton({
  onClick,
  label,
  icon: Icon = Plus,
  className,
  showLabel = false,
}: FloatingActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "fixed bottom-[calc(80px+env(safe-area-inset-bottom))] end-4 lg:bottom-6 lg:end-[264px] z-dropdown",
        showLabel
          ? "min-h-14 min-w-14 px-4 gap-2 rounded-full"
          : "w-14 h-14 min-h-[44px] min-w-[44px]",
        "flex items-center justify-center rounded-full shadow-lg",
        "bg-brand text-paper transition-transform active:scale-95 hover:bg-brand-deep hover:scale-105",
        className
      )}
    >
      <Icon className="w-6 h-6 shrink-0" />
      {showLabel && <span className="text-sm font-bold whitespace-nowrap">{label}</span>}
    </button>
  );
}
