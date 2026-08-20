"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "zman_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/.test(navigator.userAgent);
}

export function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  // تلميح احتياطي لأندرويد إن لم يصل beforeinstallprompt خلال مهلة
  const [showAndroidHint, setShowAndroidHint] = useState(false);

  useEffect(() => {
    setMounted(true);

    // تحقق إذا كان المستخدم أخفى الزر في هذه الجلسة
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // إن كنا على أندرويد ولم يصل الحدث خلال 3 ثوانٍ (وغير مثبّت)،
    // نعرض تلميحاً يدوياً (قائمة المتصفح ← تثبيت التطبيق)
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    if (isAndroid() && !isStandalone()) {
      hintTimer = setTimeout(() => setShowAndroidHint(true), 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, []);

  if (!mounted) return null;

  // لا تظهر شيئاً إن كان التطبيق مثبّتاً
  if (isStandalone()) return null;

  // لا تظهر إن أخفى المستخدم الزر في هذه الجلسة
  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  // iOS: تلميح يدوي
  if (isIOS() && !deferredPrompt) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-brand-soft border border-brand/20 px-3 py-2 text-xs text-brand-deep">
        <span className="flex-1">للتثبيت: شارك ← أضف إلى الشاشة الرئيسية</span>
        <button
          type="button"
          onClick={handleDismiss}
          className="h-12 w-12 min-h-12 min-w-12 flex items-center justify-center rounded-md hover:bg-canvas transition-colors -me-1"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // أندرويد بلا حدث مؤجَّل: تلميح يدوي (قائمة المتصفح ← تثبيت/إضافة للرئيسية)
  if (!deferredPrompt && isAndroid() && showAndroidHint) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-brand-soft border border-brand/20 px-3 py-2 text-xs text-brand-deep">
        <span className="flex-1">للتثبيت: قائمة المتصفح (⋮) ← تثبيت التطبيق</span>
        <button
          type="button"
          onClick={handleDismiss}
          className="h-12 w-12 min-h-12 min-w-12 flex items-center justify-center rounded-md hover:bg-canvas transition-colors -me-1"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // لا حدث مؤجَّل = لا نعرض الزر
  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null); // يُستهلك لمرة واحدة
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-brand-soft border border-brand/20 px-3 py-2">
      <button
        type="button"
        onClick={handleInstall}
        className="flex-1 text-sm font-bold text-brand-deep hover:text-brand transition-colors text-start min-h-12 flex items-center focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        تثبيت التطبيق
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        className="h-12 w-12 min-h-12 min-w-12 flex items-center justify-center rounded-md hover:bg-canvas transition-colors -me-1"
        aria-label="إغلاق"
      >
        <X className="w-4 h-4 text-ink-3" />
      </button>
    </div>
  );
}
