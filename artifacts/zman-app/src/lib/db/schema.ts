export * from "@/features/finance/db";
export * from "@/features/orders/db";
export * from "@/features/catalog/db";
export * from "@/features/inventory/db";
// Phase 4 — capital_asset جدول مستقل للأصول الرأسمالية المُهلَكة (خيار γ).
// لا يدخل cash_movement إطلاقاً (الإهلاك غير نقدي)؛ يُحسَب عند القراءة في
// computeOperatingPnl و IC-14 فقط. INV-22 (بعد إعادة الترقيم D10) يستثني
// صراحةً INV-1 لهذا الجدول.
export * from "@/features/depreciation/db";
export * from "@/features/snippets/db";
// Issue #16 — audit_log: جدول append-only لكل عمليات create/update/delete
// المالية. logAction() في features/audit/actions.ts يُدرج هنا OUTSIDE أي
// transaction أخرى، ويتحسّر صامتاً إن كان الجدول غير موجود بعد (migration
// 0026 يُطبَّق يدوياً على Supabase). getAuditLogPage() يرجع tableMissing=true
// بدلاً من رمي الخطأ لعرض EmptyState في /settings/audit-log.
export * from "@/features/audit/db";
