"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getFinancialSummary,
  getFinancialTrendData,
  getRecentActivities,
  getDashboardStats,
  getCashSummary,
  getAverageMonthlySpend,
  getMonthlyProfit,
  getDashboardBundle,
} from "./queries";

import { getAccountBalances } from "@/features/finance/actions";
import { getFinancialPosition } from "@/features/reports/actions";
import { dashboardKeys } from "./keys";

// المفاتيح تعيش في وحدة محايدة (keys.ts) ليستطيع الـ Server Component استيرادها.
// إعادة التصدير هنا تحفظ كل المستوردين القدامى من "../hooks".
export { dashboardKeys } from "./keys";

export function useDashboardBundle(startDate: string, endDate: string) {
  return useQuery({
    queryKey: dashboardKeys.bundle(startDate, endDate),
    queryFn: () => getDashboardBundle({ startDate, endDate }),
    enabled: !!startDate && !!endDate,
  });
}

export function useFinancialSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(startDate, endDate),
    queryFn: () => getFinancialSummary(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useRecentActivities(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: dashboardKeys.activities(startDate, endDate),
    queryFn: () => getRecentActivities(startDate, endDate),
  });
}

export function useFinancialTrendData(startDate: string, endDate: string) {
  return useQuery({
    queryKey: dashboardKeys.trend(startDate, endDate),
    queryFn: () => getFinancialTrendData(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useDashboardStats(startDate: string, endDate: string) {
  return useQuery({
    queryKey: dashboardKeys.stats(startDate, endDate),
    queryFn: () => getDashboardStats(startDate, endDate),
    enabled: !!startDate && !!endDate,
  });
}

export function useCashSummary() {
  return useQuery({
    queryKey: dashboardKeys.cash(),
    queryFn: () => getCashSummary(),
  });
}

export function useAccountBalances() {
  return useQuery({
    queryKey: dashboardKeys.balances(),
    queryFn: async () => {
      const res = await getAccountBalances();
      if (res.status === "error") throw new Error(res.message);
      return res.data || [];
    },
  });
}

export function useAverageMonthlySpend(months: number = 3) {
  return useQuery({
    queryKey: dashboardKeys.avgSpend(),
    queryFn: () => getAverageMonthlySpend(months),
  });
}

export function useMonthlyProfit(months: number = 6) {
  return useQuery({
    queryKey: dashboardKeys.monthlyProfit(months),
    queryFn: () => getMonthlyProfit(months),
  });
}

// الوضع المالي as-of تاريخ نهاية الفترة — يتوازن رياضياً بحكم بنائه، فتُقفل
// بطاقات الرصيد/التركيبة دائماً دون بند «تسويات أخرى».
export function useFinancialPosition(asOfDate: string) {
  return useQuery({
    queryKey: dashboardKeys.position(asOfDate),
    queryFn: async () => {
      const res = await getFinancialPosition(asOfDate);
      if (res.status === "error") throw new Error(res.message);
      return res.data;
    },
    enabled: !!asOfDate,
  });
}
