"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getFinancialSummary,
  getFinancialTrendData,
  getRecentActivities,
  getDashboardStats,
  getCashSummary,
  getAverageMonthlySpend,
} from "./queries";

import { getAccountBalances } from "@/features/finance/actions";

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
