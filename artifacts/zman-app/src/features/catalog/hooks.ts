"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createCatalogComponent,
  deleteCatalogComponent,
  getCatalogComponents,
  updateCatalogComponent,
} from "./actions";
import type { CatalogComponent } from "./db";
import { inventoryKeys } from "../inventory/hooks";

export const catalogKeys = {
  all: ["catalog"] as const,
  list: (search?: string) => [...catalogKeys.all, "list", search ?? ""] as const,
};

/**
 * شكل قيم إدخال الإنشاء للكتالوج.
 * يضمّ `openingStock` رغم أنّه ليس عموداً في جدول `catalog_component`، لأنّ
 * الـ server action `createCatalogComponent` يقبله (عبر Zod) ويُمرِّره إلى
 * `addCatalogMovement(sourceType='opening')` داخل نفس الـ transaction عند
 * `tracked=true && openingStock>0`. كان هذا الحقل مفقوداً من توقيع الـ hook
 * سابقاً (Issue #2 — TODO من Agent 4) فاضطرّت النماذج لاستدعاء الـ action
 * مباشرةً؛ الآن صار الـ hook مُكتمل النوع وسليم السلوك.
 */
export type CreateCatalogComponentInput = Omit<
  CatalogComponent,
  "id" | "createdAt" | "updatedAt" | "deletedAt"
> & {
  /** رصيد افتتاحي اختياري عند تفعيل التتبّع لأول مرة (يُطبَّق فقط إذا tracked=true). */
  openingStock?: number;
};

export function useCatalogComponents(search?: string) {
  return useQuery({
    queryKey: catalogKeys.list(search),
    queryFn: () => getCatalogComponents(search),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateCatalogComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateCatalogComponentInput) =>
      createCatalogComponent(values),
    onSuccess: (res) => {
      if (res.status === "ok") {
        // نُبطل namespace الكتالوج دائماً. وعند نجاح الإنشاء (الذي قد يُدرج
        // حركة مخزون افتتاحية داخل tx إذا كان tracked && openingStock>0)،
        // نُبطل أيضاً namespace المخزون ليتحدّث رصيد شاشة المخزون فوراً.
        queryClient.invalidateQueries({ queryKey: catalogKeys.all });
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      }
    },
  });
}

export function useUpdateCatalogComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CatalogComponent) =>
      updateCatalogComponent(values),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      }
    },
  });
}

export function useDeleteCatalogComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deleteCatalogComponent(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      }
    },
  });
}
