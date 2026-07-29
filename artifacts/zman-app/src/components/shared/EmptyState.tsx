"use client";

import { AlertCircle, FileQuestion } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  steps?: string[];
  actionLabel?: string;
  onAction?: () => void;
  isFilterResult?: boolean;
}

export function EmptyState({
  title,
  description,
  steps,
  actionLabel,
  onAction,
  isFilterResult = false,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-6 sm:p-8 border border-dashed border-hairline rounded-2xl bg-paper shadow-sm max-w-md mx-auto my-6">
      {isFilterResult ? (
        <AlertCircle className="w-12 h-12 text-warn-deep mb-3 shrink-0" />
      ) : (
        <FileQuestion className="w-12 h-12 text-info mb-3 shrink-0" />
      )}

      <h3 className="text-base sm:text-lg font-bold text-ink mb-1.5 leading-tight">{title}</h3>
      <p className="text-xs sm:text-sm text-ink-2 mb-4 leading-relaxed max-w-xs">
        {description}
      </p>

      {steps && steps.length > 0 && (
        <div className="w-full bg-canvas p-3.5 rounded-xl border border-hairline mb-5 text-start space-y-2 text-xs">
          <p className="font-bold text-ink">خطوات سريعة للبدء:</p>
          {steps.map((step, idx) => (
            <div key={idx} className="text-ink-2 font-medium flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-info/10 text-info font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <span>{step}</span>
            </div>
          ))}
        </div>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-info text-paper font-bold hover:bg-info/90 active:scale-95 transition-all text-xs sm:text-sm shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
