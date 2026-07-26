-- ============================================================================
-- migration 0021 — ربط purchase بصنف الكتالوج (linked_catalog_component_id)
-- ============================================================================
-- الغاية: لكل صف purchase اختياريّاً معرّف صنف الكتالوج المرتبط. إن كان الصنف
-- متتبَّعاً (tracked=true)، تُنشئ createPurchase/updatePurchase حركة مخزون `in`
-- بقيمة الكمية المشتراة. هذا «حقل الربط» الذي أُجِّل من Phase 2 (بطاقة 2.J).
--
-- آمن للتشغيل المتكرر (idempotent): ADD COLUMN IF NOT EXISTS + CREATE INDEX
-- IF NOT EXISTS. العمود nullable — لا يُكسر الصفوف القديمة (كلها بلا ربط).
-- الـ FK يستخدم ON DELETE RESTRICT (لا SET NULL ولا CASCADE) ليُحافَظ على
-- الأثر التاريخي لأي صنف مرتبط بفواتير شراء قائمة — حتى لو حُذف ناعماً.
--
-- الترتيب الإجباري للمرحلة 3: 0019 (tracked) → 0021 (هذا) → 0020 (catalog_movement).
-- هذا الترتيب يضمن أن عمود التتبّع موجود قبل أي استخدام له في استعلامات
-- catalog_movement. الـ FK على catalog_component مستقل عن وجود catalog_movement.
-- ============================================================================
--> statement-breakpoint

ALTER TABLE purchase
  ADD COLUMN IF NOT EXISTS linked_catalog_component_id uuid
  REFERENCES catalog_component(id) ON DELETE RESTRICT;

--> statement-breakpoint

-- فهرس جزئي يحصر فقط الصفوف المرتبطة (التي تحمل id غير NULL). يُسرِّع استعلامات
-- inventory/queries.ts و IC-12 عند تتبّع الأثر الشرائي على صنف ما.
CREATE INDEX IF NOT EXISTS purchase_linked_catalog_idx
  ON purchase(linked_catalog_component_id)
  WHERE linked_catalog_component_id IS NOT NULL AND deleted_at IS NULL;
