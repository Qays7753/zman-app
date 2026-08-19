/**
 * مفاتيح React Query للوحة التحكم — وحدة **محايدة** (بلا "use client").
 *
 * لماذا ملف مستقل؟ لأن `hooks.ts` مُعلَّم بـ`"use client"`، وأي استيراد منه
 * داخل Server Component لا يُعطي الكائن الحقيقي بل **مرجع وحدة عميل**
 * (client-reference proxy). فـ`dashboardKeys.bundle(...)` كان يرمي
 * `TypeError: dashboardKeys.bundle is not a function` عند كل عرض لصفحة `/`
 * فتسقط الصفحة على `global-error` (شاشة «حدث خطأ غير متوقع في النظام»).
 *
 * القاعدة: أي قيمة يشترك فيها الخادم والعميل تعيش في وحدة بلا "use client".
 */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  bundle: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "bundle", startDate, endDate] as const,
  summary: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "summary", startDate, endDate] as const,
  activities: (startDate?: string, endDate?: string) =>
    [...dashboardKeys.all, "activities", startDate, endDate] as const,
  trend: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "trend", startDate, endDate] as const,
  stats: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "stats", startDate, endDate] as const,
  cash: () => [...dashboardKeys.all, "cash"] as const,
  balances: () => [...dashboardKeys.all, "balances"] as const,
  avgSpend: () => [...dashboardKeys.all, "avgSpend"] as const,
  monthlyProfit: (months: number) =>
    [...dashboardKeys.all, "monthlyProfit", months] as const,
  position: (asOfDate: string) => [...dashboardKeys.all, "position", asOfDate] as const,
};
