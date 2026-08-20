"use client";

import { useEffect } from "react";

/**
 * حدّ خطأ على مستوى مجموعة (app) — الطبقة الناقصة.
 *
 * بدونه كان أي خطأ في أي شاشة يصعد إلى `global-error.tsx`، وهو يستبدل الشجرة
 * كلها (html/body) فتختفي القائمة والشريط ويبقى المالك أمام صفحة بيضاء بعنوان
 * «حدث خطأ غير متوقع في النظام» بلا طريق لأي شاشة أخرى. هنا يبقى الهيكل قائماً
 * وتُعزَل المشكلة في الشاشة وحدها.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center min-h-[60dvh]">
      <div className="max-w-md w-full p-6 border border-alert/20 rounded-xl bg-alert-soft/50 flex flex-col items-center">
        <h2 className="text-lg font-bold text-alert-deep mb-3">
          تعذّر تحميل هذه الشاشة
        </h2>
        <p className="text-sm text-ink-2 mb-5 leading-relaxed">
          حدثت مشكلة أثناء تجهيز البيانات. بقيّة الشاشات تعمل — يمكنك المحاولة
          مجدداً أو الانتقال لشاشة أخرى.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="min-h-[44px] px-6 py-2 bg-brand hover:bg-brand-deep text-paper rounded-md font-bold text-sm transition-colors"
        >
          إعادة المحاولة
        </button>
        {error.digest ? (
          <p className="mt-4 text-[11px] text-ink-3 font-mono" dir="ltr">
            {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
