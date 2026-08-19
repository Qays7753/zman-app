import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { DashboardClient } from "@/features/dashboard/components/DashboardClient";
import { getDashboardBundle } from "@/features/dashboard/queries";
// من keys.ts لا من hooks.ts — hooks.ts مُعلَّم "use client" فلا يصلح استيراده هنا.
import { dashboardKeys } from "@/features/dashboard/keys";
import { getAmmanDate } from "@/lib/utils";

export default async function Home(props: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const searchParams = await props.searchParams;

  // يجب أن تُطابق هذه القيم افتراضي DashboardClient («منذ البداية»):
  // start = 2020-01-01 و end = تاريخ اليوم بتوقيت عمّان. أي اختلاف يجعل
  // مفتاح الـ prefetch مغايراً لمفتاح العميل، فيضيع العمل ويُعاد الجلب.
  // (سلاسل فارغة كانت تُمرَّر إلى مقارنات date في SQL — قيمة غير صالحة.)
  const startDate = searchParams.start || "2020-01-01";
  const endDate = searchParams.end || getAmmanDate();

  const queryClient = new QueryClient();

  // prefetchQuery يبتلع الأخطاء عمداً: فشل قاعدة البيانات هنا يعني عرضاً بلا
  // بيانات مُسبقة (يجلبها العميل) — لا إسقاط الصفحة على شاشة الخطأ العامة.
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
