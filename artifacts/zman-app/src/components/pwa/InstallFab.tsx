"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "other";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream) {
    return "ios";
  }
  if (/Android/.test(userAgent)) return "android";
  return "other";
}

/**
 * زر/إرشاد تثبيت موحّد لشاشة الدخول:
 * - Android: يستخدم beforeinstallprompt عندما يقدمه المتصفح.
 * - Android بدون الحدث: يشرح مسار قائمة المتصفح بدلاً من الاختفاء الصامت.
 * - iOS: يشرح Share → Add to Home Screen لأن Safari لا يملك prompt برمجياً.
 */
export function InstallFab() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [showManualHint, setShowManualHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const currentPlatform = detectPlatform();
    setPlatform(currentPlatform);

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowManualHint(false);
    };
    const installedHandler = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowManualHint(false);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    const hintTimer = window.setTimeout(() => {
      if (currentPlatform === "ios" || currentPlatform === "android") {
        setShowManualHint(true);
      }
    }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      window.clearTimeout(hintTimer);
    };
  }, []);

  if (installed || dismissed) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (deferredPrompt) {
    return (
      <div className="flex flex-col items-center gap-1.5 animate-fade-in">
        <button
          type="button"
          onClick={handleInstall}
          aria-label="تثبيت التطبيق على الجهاز"
          title="تثبيت التطبيق"
          className="w-14 h-14 rounded-full bg-info text-paper shadow-lg flex items-center justify-center hover:bg-info/90 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2"
        >
          <Download className="w-6 h-6" />
        </button>
        <span className="text-[11px] font-semibold text-info">تثبيت التطبيق</span>
      </div>
    );
  }

  if (!showManualHint || (platform !== "ios" && platform !== "android")) {
    return null;
  }

  const instruction =
    platform === "ios"
      ? "للتثبيت على iPhone: اضغط مشاركة ثم أضف إلى الشاشة الرئيسية."
      : "للتثبيت: افتح قائمة المتصفح (⋮) ثم اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.";

  return (
    <div
      role="status"
      className="flex items-center gap-2 max-w-xs rounded-xl bg-info-soft border border-info/20 px-3 py-2 text-xs text-info"
    >
      <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 leading-relaxed">{instruction}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-info/10 transition-colors -me-1"
        aria-label="إغلاق إرشاد التثبيت"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
