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
        "fixed bottom-[calc(80px+env(safe-area-inset-bottom))] end-4 lg:bottom-6 lg:end-[264px] z-fab",
        showLabel
          ? "min-h-14 min-w-14 px-4 gap-2 rounded-full"
          : "h-14 w-14 min-h-14 min-w-14",
        "flex items-center justify-center rounded-full shadow-elev-2",
        "bg-brand text-paper transition-colors duration-[120ms] active:scale-[0.97] hover:bg-brand-hover",
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
        className,
      )}
    >
      <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
      {showLabel && <span className="text-sm font-bold whitespace-nowrap">{label}</span>}
    </button>
  );
}
