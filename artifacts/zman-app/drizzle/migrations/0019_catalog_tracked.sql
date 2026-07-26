-- ============================================================================
-- migration 0019 — علم التتبّع على catalog_component (tracked)
-- ============================================================================
-- الغاية: تمكين المخزون الانتقائي. كل صنف في الكتالوج يُوسَم بـ tracked=true
-- ليُصبح خاضعاً لخصم/إضافة المخزون في convertOrderToSale و createPurchase.
-- الأصناف غير المتتبَّعة (tracked=false، الافتراضي) لا تُنشئ حركة مخزون إطلاقاً.
--
-- آمن للتشغيل المتكرر (idempotent): ADD COLUMN IF NOT EXISTS + CREATE INDEX
-- IF NOT EXISTS. العمود NOT NULL DEFAULT false كي لا تُكسر الصفوف القديمة.
--
-- الترتيب الإجباري للمرحلة 3: 0019 (هذا) → 0021 (purchase link) → 0020 (catalog_movement).
-- ============================================================================
--> statement-breakpoint

ALTER TABLE catalog_component
  ADD COLUMN IF NOT EXISTS tracked boolean NOT NULL DEFAULT false;

--> statement-breakpoint

-- فهرس جزئي يحصر الأصناف المتتبَّعة النشطة فقط — يُسرِّع استعلامات الخصم والرصيد
-- في inventory/queries.ts و IC-12. الأصناف غير المتتبَّعة لا تُدرَج فيه إطلاقاً
-- (SELECT tracked = true AND deleted_at IS NULL).
CREATE INDEX IF NOT EXISTS catalog_component_tracked_idx
  ON catalog_component(tracked)
  WHERE tracked = true AND deleted_at IS NULL;
