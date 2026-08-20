"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Boundary caught:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <head>
        <title>خطأ في النظام | Zman</title>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          body {
            font-family: 'Cairo', sans-serif;
            background-color: #FAFAF5;
            color: #1A2E1A;
          }
        `}</style>
      </head>
      <body className="min-h-dvh flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full p-6 border border-alert/20 rounded-xl bg-alert-soft/50 shadow-sm flex flex-col items-center">
          <h2 className="text-xl font-bold text-alert-deep mb-4">
            حدث خطأ غير متوقع في النظام
          </h2>
          <p className="text-sm text-ink-2 mb-6 max-w-xs leading-relaxed">
            حدثت مشكلة غير متوقعة في تشغيل الصفحة. يرجى محاولة إعادة المحاولة أو العودة لاحقاً.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-12 px-6 py-2 bg-brand hover:bg-brand-deep text-paper rounded-md font-bold text-sm transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
