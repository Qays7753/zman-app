"use client";

import { useEffect, useState } from "react";

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function ServiceWorkerRegister() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let intervalId: number | undefined;
    let disposed = false;

    const register = async () => {
      try {
        const currentRegistration = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        if (disposed) return;

        setRegistration(currentRegistration);

        const inspectInstallingWorker = () => {
          const installing = currentRegistration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        };

        currentRegistration.addEventListener("updatefound", inspectInstallingWorker);
        inspectInstallingWorker();
        await currentRegistration.update();

        intervalId = window.setInterval(() => {
          void currentRegistration.update();
        }, UPDATE_CHECK_INTERVAL_MS);
      } catch {
        // عدم التسجيل لا يكسر التطبيق؛ يفقد فقط ميزات التثبيت والتحديث الموجّه.
      }
    };

    const handleControllerChange = () => {
      // لا نعيد التحميل تلقائياً. نترك للمستخدم تأكيد التحديث حتى لا تضيع بيانات نموذج مفتوح.
      setUpdateReady(false);
    };

    void register();
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      disposed = true;
      if (intervalId) window.clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const applyUpdate = () => {
    const waiting = registration?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, {
      once: true,
    });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return updateReady ? (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 flex items-center gap-3 rounded-xl border border-brand/20 bg-paper px-3 py-2.5 text-sm text-ink shadow-lg">
      <span className="flex-1 leading-relaxed">تحديث جديد جاهز. حدّث التطبيق لتظهر آخر التحسينات.</span>
      <button
        type="button"
        onClick={applyUpdate}
        className="min-h-12 rounded-lg bg-brand px-3 font-bold text-paper active:scale-95 transition-transform"
      >
        تحديث الآن
      </button>
    </div>
  ) : null;
}
