import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { DashboardClient } from "@/features/dashboard/components/DashboardClient";
import { getDashboardBundle } from "@/features/dashboard/queries";
import { dashboardKeys } from "@/features/dashboard/hooks";

export default async function Home(props: { searchParams: Promise<{ start?: string; end?: string; range?: string }> }) {
  const searchParams = await props.searchParams;
  const range = searchParams.range || "all";
  
  // Default to empty strings for "all" range (same as DashboardClient default logic)
  let startDate = searchParams.start || "";
  let endDate = searchParams.end || "";

  if (range !== "custom" && range !== "all") {
    // If it's a specific predefined range, the client calculates it on the fly.
    // For SSR, we just let the client do it unless we want to replicate the logic here.
    // However, "all" is the default, which uses empty strings.
  }

  const queryClient = new QueryClient();

  // Prefetch the dashboard bundle
  await queryClient.prefetchQuery({
    queryKey: dashboardKeys.bundle(startDate, endDate),
    queryFn: () => getDashboardBundle({ startDate, endDate }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardClient />
    </HydrationBoundary>
  );
}
