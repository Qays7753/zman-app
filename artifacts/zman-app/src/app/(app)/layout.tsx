"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShellProvider } from "@/providers/app-shell-context";
import { AppShell } from "@/components/layout/AppShell";
import { getRecentActivities, getFinancialSummary } from "@/features/dashboard/queries";
import { getOrders } from "@/features/orders/queries";
import { subDays, format } from "date-fns";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // 1. جلب مسبق للأنشطة الأخيرة في لوحة القيادة
    queryClient.prefetchQuery({
      queryKey: ["dashboard", "activities"],
      queryFn: () => getRecentActivities(),
    });

    // 2. جلب مسبق لملخص لوحة القيادة المالية لآخر 30 يوم
    const start = subDays(new Date(), 29);
    const end = new Date();
    const startDateStr = format(start, "yyyy-MM-dd");
    const endDateStr = format(end, "yyyy-MM-dd");
    
    queryClient.prefetchQuery({
      queryKey: ["dashboard", "summary", startDateStr, endDateStr],
      queryFn: () => getFinancialSummary(startDateStr, endDateStr),
    });

    // 3. جلب مسبق لقائمة الطلبات الافتراضية
    queryClient.prefetchInfiniteQuery({
      queryKey: ["orders", "list", "infinite", { status: "all", q: "" }],
      queryFn: () => getOrders({ status: "all", q: "" }),
      initialPageParam: null as string | null,
    });
  }, [queryClient]);

  return (
    <AppShellProvider>
      <AppShell>{children}</AppShell>
    </AppShellProvider>
  );
}
