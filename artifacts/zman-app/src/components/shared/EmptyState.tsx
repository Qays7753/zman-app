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
    <div className="mx-auto my-6 flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-paper p-6 text-center sm:p-8">
      {isFilterResult ? (
        <AlertCircle className="mb-3 h-12 w-12 shrink-0 text-info" aria-hidden="true" />
      ) : (
        <FileQuestion className="mb-3 h-12 w-12 shrink-0 text-ink-3" aria-hidden="true" />
      )}

      <h3 className="mb-1.5 text-base font-bold leading-tight text-ink sm:text-lg">{title}</h3>
      <p className="mb-4 max-w-xs text-sm leading-relaxed text-ink-2">{description}</p>

      {steps && steps.length > 0 && (
        <div className="mb-5 w-full space-y-2 rounded-xl border border-hairline bg-canvas p-3.5 text-start text-sm">
          <p className="font-bold text-ink">خطوات سريعة للبدء:</p>
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2 font-medium text-ink-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-deep">
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
          className="min-h-12 rounded-xl bg-brand px-6 py-3 text-sm font-bold text-paper transition-colors hover:bg-brand-hover active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
