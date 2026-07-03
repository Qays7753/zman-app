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
    staleTime: 0,
    refetchOnMount: "always",
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
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
      if (res.status === "ok" || (res.status === "error" && res.message?.includes("جهة أخرى"))) {
        queryClient.invalidateQueries({ queryKey: orderKeys.all });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
        const updatedOrder = res.data as any;
        // تحديث فوري للكاش المحلي للقوائم لتجنب الوميض والبيانات القديمة
        queryClient.setQueriesData(
          { queryKey: orderKeys.lists() },
          (oldData: any) => {
            if (!oldData) return oldData;

            // إذا كانت بنية استعلام صفحات لانهائية (Infinite Scroll)
            if (oldData.pages) {
              return {
                ...oldData,
                pages: oldData.pages.map((page: any) => ({
                  ...page,
                  items: page.items.map((item: any) =>
                    item.id === updatedOrder.id
                      ? { ...item, status: updatedOrder.status, updatedAt: updatedOrder.updatedAt }
                      : item
                  ),
                })),
              };
            }

            // إذا كانت بنية استعلام قائمة عادية
            if (oldData.items) {
              return {
                ...oldData,
                items: oldData.items.map((item: any) =>
                  item.id === updatedOrder.id
                    ? { ...item, status: updatedOrder.status, updatedAt: updatedOrder.updatedAt }
                    : item
                ),
              };
            }

            return oldData;
          }
        );

        // إبطال كاش تفاصيل الطلب المعدّل وتقارير المالية
        queryClient.invalidateQueries({ queryKey: orderKeys.detail(updatedOrder.id) });
        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
    // إبطال الكاش العام دائماً بعد الانتهاء من الطلب لضمان تماسك البيانات بين الأجهزة
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
