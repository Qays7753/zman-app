"use server";

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
 * 🔒 userId: قيمة ثابتة "owner" — لا تُقرأ من الكوكي إطلاقاً.
 *
 * السبب: كوكي `zman_session` يحمل قيمة PASSCODE نفسها حرفياً
 * (انظر `src/app/login/actions.ts:12`). قراءتها هنا تكتب كلمة السر نصّاً
 * صريحاً في كل صف من `audit_log` — أي أن قاعدة البيانات تصير مخزناً دائماً
 * لكلمة السر، ويكفي تسريب نسخة احتياطية واحدة لكشفها.
 *
 * والمقابل صفر: النظام أحادي المستخدم (المالك فقط)، فلا معلومة تُكتسب من
 * تسجيل «مَن» — الجواب دائماً هو نفسه. القيمة الثابتة تحفظ شكل العمود
 * لأي توسّع مستقبلي متعدّد المستخدمين بلا أي مخاطرة اليوم.
 */
export async function logAction(input: LogActionInput): Promise<void> {
  try {
    const userId = "owner";

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
    //   - أخطاء اتصال عابرة بقاعدة البيانات
    console.warn("[audit] logAction failed (non-fatal):", e);
  }
}
