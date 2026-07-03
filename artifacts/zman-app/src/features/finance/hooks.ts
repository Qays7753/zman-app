"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  convertOrderToSale,
  createExpense,
  createPurchase,
  createSale,
  deleteExpense,
  deletePurchase,
  deleteSale,
  updateExpense,
  updatePurchase,
  updateSale,
  getPurchaseItemCatalog,
  createPurchaseItemCatalog,
  updatePurchaseItemCatalog,
  deletePurchaseItemCatalog,
  getExpenseCategoryCatalog,
  createExpenseCategoryCatalog,
  updateExpenseCategoryCatalog,
  deleteExpenseCategoryCatalog,
} from "./actions";
import type {
  GetExpensesFilters,
  GetPurchasesFilters,
  GetSalesFilters,
} from "./queries";
import {
  getExpense,
  getExpenseCategories,
  getExpenses,
  getPurchase,
  getPurchases,
  getSale,
  getSales,
} from "./queries";

export const financeKeys = {
  all: ["finance"] as const,
  purchases: () => [...financeKeys.all, "purchases"] as const,
  purchaseList: (filters: Omit<GetPurchasesFilters, "cursor">) =>
    [...financeKeys.purchases(), "list", filters] as const,
  purchaseDetail: (id: string) =>
    [...financeKeys.purchases(), "detail", id] as const,

  expenses: () => [...financeKeys.all, "expenses"] as const,
  expenseList: (filters: Omit<GetExpensesFilters, "cursor">) =>
    [...financeKeys.expenses(), "list", filters] as const,
  expenseDetail: (id: string) =>
    [...financeKeys.expenses(), "detail", id] as const,
  categories: () => [...financeKeys.expenses(), "categories"] as const,

  sales: () => [...financeKeys.all, "sales"] as const,
  saleList: (filters: Omit<GetSalesFilters, "cursor">) =>
    [...financeKeys.sales(), "list", filters] as const,
  saleDetail: (id: string) => [...financeKeys.sales(), "detail", id] as const,
};

// 1. هوك المشتريات (Purchases)
export function useInfinitePurchases(
  filters: Omit<GetPurchasesFilters, "cursor">,
) {
  return useInfiniteQuery({
    queryKey: financeKeys.purchaseList(filters),
    queryFn: ({ pageParam }) =>
      getPurchases({
        ...filters,
        cursor: (pageParam as string | null) || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function usePurchase(id: string) {
  return useQuery({
    queryKey: financeKeys.purchaseDetail(id),
    queryFn: () => getPurchase(id),
    enabled: !!id,
  });
}

export function useCreatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      values,
      requestId,
    }: {
      values: unknown;
      requestId?: string;
    }) => createPurchase(values, requestId),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: financeKeys.purchases() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useUpdatePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updatedAt,
      values,
    }: {
      id: string;
      updatedAt: string;
      values: unknown;
    }) => updatePurchase(id, updatedAt, values),
    onSuccess: (res, variables) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.purchases() });
        queryClient.invalidateQueries({
          queryKey: financeKeys.purchaseDetail(variables.id),
        });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useDeletePurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deletePurchase(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.purchases() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

// 2. هوك المصاريف (Expenses)
export function useInfiniteExpenses(
  filters: Omit<GetExpensesFilters, "cursor">,
) {
  return useInfiniteQuery({
    queryKey: financeKeys.expenseList(filters),
    queryFn: ({ pageParam }) =>
      getExpenses({
        ...filters,
        cursor: (pageParam as string | null) || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: financeKeys.expenseDetail(id),
    queryFn: () => getExpense(id),
    enabled: !!id,
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: financeKeys.categories(),
    queryFn: getExpenseCategories,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      values,
      requestId,
    }: {
      values: unknown;
      requestId?: string;
    }) => createExpense(values, requestId),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: financeKeys.expenses() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updatedAt,
      values,
    }: {
      id: string;
      updatedAt: string;
      values: unknown;
    }) => updateExpense(id, updatedAt, values),
    onSuccess: (res, variables) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.expenses() });
        queryClient.invalidateQueries({
          queryKey: financeKeys.expenseDetail(variables.id),
        });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deleteExpense(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.expenses() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

// 3. هوك المبيعات (Sales)
export function useInfiniteSales(filters: Omit<GetSalesFilters, "cursor">) {
  return useInfiniteQuery({
    queryKey: financeKeys.saleList(filters),
    queryFn: ({ pageParam }) =>
      getSales({
        ...filters,
        cursor: (pageParam as string | null) || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useSale(id: string) {
  return useQuery({
    queryKey: financeKeys.saleDetail(id),
    queryFn: () => getSale(id),
    enabled: !!id,
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      values,
      requestId,
    }: {
      values: unknown;
      requestId?: string;
    }) => createSale(values, requestId),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: financeKeys.sales() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useUpdateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updatedAt,
      values,
    }: {
      id: string;
      updatedAt: string;
      values: unknown;
    }) => updateSale(id, updatedAt, values),
    onSuccess: (res, variables) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.sales() });
        queryClient.invalidateQueries({
          queryKey: financeKeys.saleDetail(variables.id),
        });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deleteSale(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: financeKeys.sales() });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useConvertOrderToSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      requestId,
    }: {
      orderId: string;
      requestId?: string;
    }) => convertOrderToSale(orderId, requestId),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: financeKeys.sales() });
        queryClient.invalidateQueries({ queryKey: ["orders"] }); // إبطال كاش الطلبات لتحديث الحالة
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });
}

// -------------------------------------------------------------
// 5. أصناف المشتريات (Purchase Item Catalog Hooks)
// -------------------------------------------------------------

export function usePurchaseItemCatalog() {
  return useQuery({
    queryKey: ["finance", "purchase-catalog"] as const,
    queryFn: () => getPurchaseItemCatalog(),
  });
}

export function useCreatePurchaseItemCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPurchaseItemCatalog,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "purchase-catalog"] });
      }
    },
  });
}

export function useUpdatePurchaseItemCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updatePurchaseItemCatalog(id, name),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "purchase-catalog"] });
      }
    },
  });
}

export function useDeletePurchaseItemCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePurchaseItemCatalog,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "purchase-catalog"] });
      }
    },
  });
}

// -------------------------------------------------------------
// 6. فئات المصاريف (Expense Category Catalog Hooks)
// -------------------------------------------------------------

export function useExpenseCategoryCatalog() {
  return useQuery({
    queryKey: ["finance", "expense-catalog"] as const,
    queryFn: () => getExpenseCategoryCatalog(),
  });
}

export function useCreateExpenseCategoryCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createExpenseCategoryCatalog,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "expense-catalog"] });
      }
    },
  });
}

export function useUpdateExpenseCategoryCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateExpenseCategoryCatalog(id, name),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "expense-catalog"] });
      }
    },
  });
}

export function useDeleteExpenseCategoryCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExpenseCategoryCatalog,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["finance", "expense-catalog"] });
      }
    },
  });
}

