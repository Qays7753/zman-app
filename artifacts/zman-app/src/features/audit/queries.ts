"use server";

import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog } from "./db";

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  changesSnapshot: unknown;
  timestamp: string; // ISO
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  nextCursor: string | null;
  tableMissing: boolean;
}

const PAGE_SIZE = 50;

/**
 * Issue #16 — Audit log query with empty-state safety.
 *
 * Returns `{ items: [], nextCursor: null, tableMissing: true }` when the
 * `audit_log` table doesn't exist yet (migration 0026 not applied). This lets
 * the /settings/audit-log page render an EmptyState instead of an error
 * before the owner applies the migration manually on Supabase.
 *
 * Cursor = the ISO timestamp of the last item on the previous page. We fetch
 * PAGE_SIZE + 1 rows and use the extra row as a "hasMore" signal.
 */
export async function getAuditLogPage(cursor?: string): Promise<AuditLogPage> {
  try {
    // Build the query in two branches because Drizzle's PgSelect type
    // doesn't allow calling `.where()` after `.limit()` — we need to apply
    // the cursor filter BEFORE limit. Two concrete await expressions keep
    // the inferred types grounded and avoid `let query = ... .limit()`
    // reassignment type errors.
    const rows = cursor
      ? await db
          .select()
          .from(auditLog)
          .where(sql`${auditLog.timestamp} < ${cursor}::timestamptz`)
          .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
          .limit(PAGE_SIZE + 1)
      : await db
          .select()
          .from(auditLog)
          .orderBy(desc(auditLog.timestamp), desc(auditLog.id))
          .limit(PAGE_SIZE + 1);

    const hasMore = rows.length > PAGE_SIZE;
    const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      userId: r.userId,
      changesSnapshot: r.changesSnapshot,
      timestamp:
        r.timestamp instanceof Date
          ? r.timestamp.toISOString()
          : new Date(r.timestamp as unknown as string).toISOString(),
    }));

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.timestamp ?? null : null,
      tableMissing: false,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Match the exact PostgreSQL error string for a missing relation.
    // Sample: 'relation "audit_log" does not exist'
    if (
      msg.includes("audit_log") &&
      (msg.includes("does not exist") || msg.includes("relation"))
    ) {
      return { items: [], nextCursor: null, tableMissing: true };
    }
    throw e;
  }
}
