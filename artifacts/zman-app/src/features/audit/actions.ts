"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { auditLog } from "./db";

interface LogActionInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  changesSnapshot?: unknown;
}

/**
 * Issue #16 — Defensive audit logger.
 *
 * CRITICAL CONTRACT:
 *   - Runs OUTSIDE the caller's DB transaction. The caller MUST call logAction
 *     AFTER `await db.transaction(...)` returns successfully — never inside it.
 *     A failed insert here must never roll back a real expense/purchase/order.
 *   - try/catch swallows ALL errors (including "relation does not exist" when
 *     migration 0026 hasn't been applied to production yet). Only `console.warn`s.
 *     This guarantees that the audit log never breaks the app before the owner
 *     applies the migration manually via Supabase SQL Editor.
 *   - NEVER rethrows. NEVER blocks the caller. NEVER returns a value the
 *     caller must inspect.
 *   - Returns void (Promise<void>).
 *
 * userId best-effort: this app has a single-owner auth model (cookie
 * `zman_session` holds the PASSCODE). We record it for completeness; if
 * cookies() is unavailable (e.g. called outside a request context) we leave
 * userId null and still log the action.
 */
export async function logAction(input: LogActionInput): Promise<void> {
  try {
    let userId: string | null = null;
    try {
      const cookieStore = await cookies();
      userId = cookieStore.get("zman_session")?.value ?? null;
    } catch {
      // cookies() unavailable — leave userId null. The audit row is still useful.
    }

    await db.insert(auditLog).values({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      userId,
      changesSnapshot: input.changesSnapshot ?? null,
    });
  } catch (e) {
    // Swallow ALL errors. The audit log must NEVER break the caller's flow.
    // Common swallowed cases:
    //   - "relation \"audit_log\" does not exist" (migration 0026 not applied yet)
    //   - transient DB connectivity errors
    //   - cookies() unavailable outside request context
    console.warn("[audit] logAction failed (non-fatal):", e);
  }
}
