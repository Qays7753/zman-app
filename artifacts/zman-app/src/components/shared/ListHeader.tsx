"use client";
import { Search } from "lucide-react";
import React from "react";

interface ListHeaderProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export function ListHeader({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  actions,
  filters,
}: ListHeaderProps) {
  return (
    <div className="sticky top-0 z-sticky bg-canvas/95 backdrop-blur-sm pt-2 pb-3 -mx-4 px-4 lg:mx-0 lg:px-0 space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-ink/40 pointer-events-none" />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-12 ps-10 pe-4 rounded-lg border border-hairline bg-paper text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>
        {actions}
      </div>
      {filters && (
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {filters}
          </div>
          <div className="absolute top-0 bottom-1 left-0 w-8 bg-gradient-to-l from-transparent to-canvas pointer-events-none" />
        </div>
      )}
    </div>
  );
}
