"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useEffect, useState } from "react";

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
            staleTime: 5 * 60 * 1000, // 5 دقائق افتراضياً للبيانات
            gcTime: 30 * 60 * 1000, // 30 دقيقة للمخزن المؤقت
            refetchOnWindowFocus: false, // تجنب التحديث عند التركيز فقط
            refetchOnReconnect: true, // التحديث عند استعادة الاتصال بالإنترنت
          },
        },
      }),
  );

  const [persister] = useState(() => {
    if (typeof window !== "undefined") {
      return createSyncStoragePersister({
        storage: window.localStorage,
        key: "ZMAN_QUERY_CACHE", // مفتاح تخزين مخصص
      });
    }
    return null;
  });

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !persister) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: "1.0.0", // رقم الإصدار لإلغاء الكاش القديم عند التحديث
        maxAge: 30 * 60 * 1000, // صلاحية الكاش المحلي تتطابق مع gcTime
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // نحفظ فقط الاستعلامات الناجحة (لا نخزّن حالات الفشل أو التحميل)
            if (query.state.status !== "success") return false;
            // ولا نحفظ أي استعلام يحتوي مفتاحه على أسرار أو كلمات مرور
            const hasSensitiveData = query.queryKey.some(
              (k) =>
                typeof k === "string" &&
                (k.toLowerCase().includes("auth") ||
                  k.toLowerCase().includes("password") ||
                  k.toLowerCase().includes("passcode"))
            );
            return !hasSensitiveData;
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

