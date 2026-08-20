"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorState({
  message = "فشل تحميل البيانات. يرجى التحقق من الاتصال بالإنترنت ثم المحاولة مرة أخرى.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="mx-auto my-8 flex max-w-md flex-col items-center justify-center rounded-xl border border-alert/30 bg-alert-soft p-6 text-center">
      <AlertTriangle className="mb-3 h-12 w-12 text-alert-deep" aria-hidden="true" />
      <h3 className="mb-2 text-base font-bold text-alert-deep">تعذر تحميل البيانات</h3>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-ink-2">{message}</p>

      <button
        type="button"
        onClick={onRetry}
        className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-alert-deep px-6 py-3 text-sm font-bold text-paper transition-colors hover:bg-alert focus-visible:ring-2 focus-visible:ring-alert-deep focus-visible:ring-offset-2"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        <span>إعادة المحاولة</span>
      </button>
    </div>
  );
}
