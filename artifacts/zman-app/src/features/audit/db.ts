import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// Issue #16 — جدول سجل التدقيق (audit_log)
// ============================================================================
// append-only: يُخزّن سجلاً لكل عملية تعديل مالي (create/update/delete) لتمكين
// المالك من مراجعة من فعل ماذا ومتى. لا حذف ناعم ولا تحديث — كل صف حدث نهائي.
//
// Defensive contract (مهم جداً):
//   - logAction() في actions.ts يُدرج صفوفاً هنا OUTSIDE أي transaction أخرى،
//     ويبتلع كل الأخطاء (بما فيها "relation does not exist" قبل تطبيق migration
//     0026). هذا يضمن أن غياب الجدول في الإنتاج لا يكسر أي create/update/delete.
//   - getAuditLogPage() في queries.ts يلتقط "relation does not exist" ويرجع
//     { items: [], tableMissing: true } بدلاً من رمي الخطأ — لعرض EmptyState.
// ============================================================================

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    userId: text("user_id"),
    changesSnapshot: jsonb("changes_snapshot"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_timestamp_idx").on(t.timestamp.desc()),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
