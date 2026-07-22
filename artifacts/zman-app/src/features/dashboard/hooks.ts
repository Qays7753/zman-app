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
} from "./queries";

import { getAccountBalances } from "@/features/finance/actions";
import { getFinancialPosition } from "@/features/reports/actions";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "summary", startDate, endDate] as const,
  activities: (startDate?: string, endDate?: string) => [...dashboardKeys.all, "activities", startDate, endDate] as const,
  trend: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "trend", startDate, endDate] as const,
  stats: (startDate: string, endDate: string) =>
    [...dashboardKeys.all, "stats", startDate, endDate] as const,
  cash: () => [...dashboardKeys.all, "cash"] as const,
  balances: () => [...dashboardKeys.all, "balances"] as const,
  avgSpend: () => [...dashboardKeys.all, "avgSpend"] as const,
  monthlyProfit: (months: number) => [...dashboardKeys.all, "monthlyProfit", months] as const,
  position: (asOfDate: string) => [...dashboardKeys.all, "position", asOfDate] as const,
};

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
