"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSnippet,
  deleteSnippet,
  getSnippets,
  updateSnippet,
} from "./actions";
import type { Snippet } from "./db";

export const snippetsKeys = {
  all: ["snippets"] as const,
  list: (search?: string) => [...snippetsKeys.all, "list", search ?? ""] as const,
};

export function useSnippets(search?: string) {
  return useQuery({
    queryKey: snippetsKeys.list(search),
    queryFn: () => getSnippets(search),
    staleTime: 60_000,
    refetchOnMount: true,
  });
}

export function useCreateSnippet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Omit<Snippet, "id" | "createdAt" | "updatedAt" | "deletedAt">) =>
      createSnippet(values),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: snippetsKeys.all });
      }
    },
  });
}

export function useUpdateSnippet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Snippet) =>
      updateSnippet(values),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: snippetsKeys.all });
      }
    },
  });
}

export function useDeleteSnippet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updatedAt }: { id: string; updatedAt: string }) =>
      deleteSnippet(id, updatedAt),
    onSuccess: (res) => {
      if (res.status === "ok") {
        queryClient.invalidateQueries({ queryKey: snippetsKeys.all });
      }
    },
  });
}
