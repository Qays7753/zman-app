"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getAuditLogPage } from "./queries";

export type { AuditLogEntry, AuditLogPage } from "./queries";

export const auditKeys = {
  all: ["audit"] as const,
  list: () => [...auditKeys.all, "list"] as const,
};

/**
 * Issue #16 — Infinite query for the audit log page.
 *
 * Each page fetches up to PAGE_SIZE entries (defined in queries.ts). The
 * cursor is the ISO timestamp of the last item on the previous page.
 */
export function useAuditLog() {
  return useInfiniteQuery({
    queryKey: auditKeys.list(),
    queryFn: ({ pageParam }) => getAuditLogPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
