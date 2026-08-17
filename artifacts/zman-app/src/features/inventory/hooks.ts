"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getComponentStock,
  getAllComponentStocks,
  getCatalogMovements,
  getInventoryValuation,
} from "./queries";
import { adjustStock } from "./actions";

// ─────────────────────────────────────────────────────────────────────────
// React Query hooks للمخزون
// ─────────────────────────────────────────────────────────────────────────
// جميع الـ keys تعيش تحت namespace "inventory" لتسهيل invalidation.
// invalidation تتم من الـ mutations الناجحة في finance/actions.ts و orders/actions.ts
// عبر استدعاء `queryClient.invalidateQueries({ queryKey: ["inventory"] })`.
// ─────────────────────────────────────────────────────────────────────────

export const inventoryKeys = {
  all: ["inventory"] as const,
  stock: (catalogComponentId: string, asOfDate?: string) =>
    [...inventoryKeys.all, "stock", catalogComponentId, asOfDate ?? ""] as const,
  allStocks: (asOfDate?: string) =>
    [...inventoryKeys.all, "all-stocks", asOfDate ?? ""] as const,
  movements: (catalogComponentId: string, limit?: number) =>
    [
      ...inventoryKeys.all,
      "movements",
      catalogComponentId,
      limit ?? 20,
    ] as const,
  valuation: (asOfDate?: string) =>
    [...inventoryKeys.all, "valuation", asOfDate ?? ""] as const,
};

/**
 * أرصدة كل الأصناف دفعة واحدة. يُستخدم في CatalogClient لتفادي مشكلة N+1.
 */
export function useAllComponentStocks(asOfDate?: string) {
  return useQuery({
    queryKey: inventoryKeys.allStocks(asOfDate),
    queryFn: () => getAllComponentStocks(asOfDate),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/**
 * رصيد صنف واحد من الكتالوج (live). يُستخدم في:
 *   - CatalogClient: badge "X حبة متاحة".
 *   - ComponentsEditor: عرض الرصيد بجانب كل صنف في الـ picker.
 *   - OrderForm: حساب الرصيد الإجمالي للتحذير.
 *   - PurchaseForm: عرض الرصيد الحالي أسفل حقل الربط.
 */
export function useComponentStock(catalogComponentId?: string, asOfDate?: string) {
  return useQuery({
    queryKey: catalogComponentId
      ? inventoryKeys.stock(catalogComponentId, asOfDate)
      : ["inventory", "stock", "none"],
    queryFn: () => getComponentStock(catalogComponentId!, asOfDate),
    enabled: !!catalogComponentId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/**
 * حركات صنف (آخر N). يُستخدم في مودال «عرض حركات المخزون» في CatalogClient.
 */
export function useCatalogMovements(catalogComponentId?: string, limit = 20) {
  return useQuery({
    queryKey: catalogComponentId
      ? inventoryKeys.movements(catalogComponentId, limit)
      : ["inventory", "movements", "none"],
    queryFn: () => getCatalogMovements(catalogComponentId!, limit),
    enabled: !!catalogComponentId,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/**
 * إجمالي قيمة المخزون التقديرية. يُستخدم في لوحة IC-12 (informational).
 */
export function useInventoryValuation(asOfDate?: string) {
  return useQuery({
    queryKey: inventoryKeys.valuation(asOfDate),
    queryFn: () => getInventoryValuation(asOfDate),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/**
 * تسوية يدوية للرصيد (صرف يدوي / إضافة يدوية). §6 سيناريو 11.
 * لا تدخل P&L — حركة مخزون صرفة.
 */
export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      catalogComponentId: string;
      direction: "in" | "out";
      quantity: number;
      reason?: string;
      requestId?: string;
    }) => adjustStock(params),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      }
    },
  });
}
