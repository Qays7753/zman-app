"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState, useEffect } from "react";

const CACHE_KEY = "zman-query-cache";

// أي تغيير في شكل البيانات المخزّنة يتطلّب رفع هذه القيمة: persist يتجاهل عندها
// الكاش القديم ويحذفه بدل أن يفشل في hydrate ويكسر الإقلاع.
const CACHE_BUSTER = "v2";

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes — prevents redundant refetch waterfalls on window focus
            // gcTime يجب أن يكون ≥ maxAge للـ persist، وإلا يُهمَل الكاش المحفوظ
            // ولا يُستعاد عند الفتح (فتظهر شاشة الخطأ بدل البيانات المخزّنة).
            gcTime: 24 * 60 * 60 * 1000, // 24 hours — matches persist maxAge
            retry: 3, // retry 3 times on cold-start timeout
            retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
          },
          // Task A — إعادة محاولة واحدة للـ mutations عند الأخطاء الشبكية العابرة.
          // نترك retryDelay يرث الافتراضي (exponential backoff) لأن المحاولة واحدة
          // فلا داعي لتخصيصه. queries.retry يبقى 3 — لا تغيير.
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  // Task 4: persist to localStorage so dashboard renders last cached data instantly
  useEffect(() => {
    if (typeof window === "undefined") return;

    let localStoragePersister: ReturnType<typeof createSyncStoragePersister>;
    try {
      localStoragePersister = createSyncStoragePersister({
        storage: window.localStorage,
        key: CACHE_KEY,
        throttleTime: 1000,
      });
    } catch {
      // التخزين غير متاح (وضع خاص / حصة ممتلئة): التطبيق يعمل بدون كاش
      return;
    }
    const [unsubscribe, restorePromise] = persistQueryClient({
      queryClient,
      persister: localStoragePersister,
      buster: CACHE_BUSTER,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // persistQueryClientRestore يعيد رمي الخطأ إذا كان الكاش المحفوظ تالفاً أو
    // بصيغة قديمة. بدون التقاط restorePromise يتحوّل ذلك إلى unhandled rejection
    // يكسر التطبيق عند الإقلاع. الكاش مجرد تسريع — فشله يجب ألّا يمنع عرض البيانات.
    restorePromise.catch(() => {
      try {
        window.localStorage.removeItem(CACHE_KEY);
      } catch {
        // تجاهل: قد يكون التخزين محظوراً (وضع التصفح الخاص)
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
