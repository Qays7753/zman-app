import { Suspense } from "react";
import { SkeletonList } from "@/components/shared/SkeletonList";
import FinanceClient from "./FinanceClient";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { getOpeningBalance } from "@/features/finance/actions";
import { getAccounts } from "@/features/finance/actions";

export const metadata = {
  title: "المالية - Zman",
  description: "إدارة الحسابات المالية والمبيعات والمصاريف والمشتريات",
};

export default async function FinancePage() {
  const queryClient = new QueryClient();

  // Prefetch critical finance data (Accounts and Opening Balance)
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ["finance", "opening-balance"],
      queryFn: async () => {
        const res = await getOpeningBalance();
        return res.status === "ok" ? res.data : null;
      },
    }),
    queryClient.prefetchQuery({
      queryKey: ["finance", "accounts"],
      queryFn: async () => {
        const res = await getAccounts();
        return res.status === "ok" ? res.data : [];
      },
    }),
  ]);

  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-4">
          <SkeletonList count={4} />
        </div>
      }
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <FinanceClient />
      </HydrationBoundary>
    </Suspense>
  );
}
