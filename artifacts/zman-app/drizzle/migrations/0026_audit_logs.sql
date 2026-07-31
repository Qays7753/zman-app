-- ============================================================================
-- migration 0026 — جدول سجل التدقيق (audit_log) — Issue #16
-- ============================================================================
-- يخزّن سجلاً append-only لكل عملية تعديل مالي (create/update/delete) لتمكين
-- المالك من مراجعة من فعل ماذا ومتى. لا حذف ناعم ولا تحديث — كل صف حدث نهائي.
--
-- logAction() في src/features/audit/actions.ts يُدرج صفوفاً هنا OUTSIDE أي
-- transaction أخرى، ويبتلع كل الأخطاء (بما فيها "relation does not exist"
-- قبل تطبيق هذا الـ migration). getAuditLogPage() في queries.ts يلتقط نفس
-- الخطأ ويرجع { tableMissing: true } لعرض EmptyState بدلاً من ErrorState.
--
-- آمن للتشغيل المتكرر (idempotent): CREATE TABLE IF NOT EXISTS +
-- CREATE INDEX IF NOT EXISTS — لا فشل عند الإعادة. مطابق لمخرجات
-- `drizzle-kit generate` (يجب أن يطبع "No schema changes" بعد هذا الملف).
-- ============================================================================

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "user_id" text,
  "changes_snapshot" jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_timestamp_idx"
  ON "audit_log" USING btree ("timestamp" DESC);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_log_entity_idx"
  ON "audit_log" USING btree ("entity_type", "entity_id");
