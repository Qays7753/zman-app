"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createOrder,
  deleteOrder,
  updateOrder,
  updateOrderStatus,
  getMessageTemplate,
  updateMessageTemplate,
} from "./actions";
import type { GetOrdersFilters } from "./queries";
import { getOrder, getOrderDatesForMonth, getOrders } from "./queries";

// المفاتيح الموحدة للاستعلامات (§2)
export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (filters: GetOrdersFilters) => [...orderKeys.lists(), filters] as const,
  infinite: (filters: Omit<GetOrdersFilters, "cursor">) =>
    [...orderKeys.lists(), "infinite", filters] as const,
  details: () => [...orderKeys.all, "detail"] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
};

/**
 * هوك جلب قائمة الطلبات بفلترة ديناميكية
 */
export function useOrders(filters: GetOrdersFilters) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => getOrders(filters),
  });
}

/**
 * هوك جلب الطلبات بـ Infinite Scroll (Cursor-based) (§10.1)
 */
export function useInfiniteOrders(filters: Omit<GetOrdersFilters, "cursor">) {
  return useInfiniteQuery({
    queryKey: orderKeys.infinite(filters),
    queryFn: ({ pageParam }) =>
      getOrders({
        ...filters,
        cursor: (pageParam as string | null) || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

/**
 * هوك جلب تفاصيل طلب محدد ومكوناته
 */
export function useOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => getOrder(id),
    enabled: !!id,
  });
}

/**
 * هوك إنشاء طلب جديد مع إبطال الكاش التلقائي عند النجاح
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

/**
 * هوك تعديل طلب قائم وإبطال كاش القائمة والطلب المعني
 */
export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOrder,
    onSuccess: (res, _variables) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

/**
 * هوك حذف طلب لطيفاً وإبطال الكاش
 */
export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deleteOrder(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

/**
 * هوك جلب أيام الشهر التي تحتوي على طلبات (للتقويم)
 */
export function useOrderDatesForMonth(year: number, month: number) {
  return useQuery({
    queryKey: [...orderKeys.all, "calendar", year, month] as const,
    queryFn: () => getOrderDatesForMonth(year, month),
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      newStatus,
      updatedAt,
    }: {
      id: string;
      newStatus: string;
      updatedAt: string;
    }) => updateOrderStatus(id, newStatus, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
      }
    },
  });
}

export function useMessageTemplate() {
  return useQuery({
    queryKey: ["orders", "message-template"] as const,
    queryFn: () => getMessageTemplate(),
  });
}

export function useUpdateMessageTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMessageTemplate,
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: ["orders", "message-template"] });
      }
    },
  });
}
