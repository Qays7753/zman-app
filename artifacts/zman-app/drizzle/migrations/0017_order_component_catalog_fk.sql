-- ============================================================================
-- migration 0017 — ربط مكوّنات الطلب بالكتالوج (catalog_component_id FK)
-- ============================================================================
-- الغاية: تخزين معرّف صنف الكتالوج على كل صف في order_component عند اختيار
-- الصنف من الـ picker. هذا الربط هو «الرابط المفقود» الذي يُتيح لاحقاً خصم
-- المخزون الانتقائي داخل convertOrderToSale (المرحلة 3).
--
-- آمن للتشغيل المتكرر (idempotent): كل خطوة محروسة بـ IF [NOT] EXISTS.
-- العمود nullable لإبقاء الصفوف القديمة (التي أُنشئت يدوياً بلا صنف مرتبط)
-- صالحة. الـ FK يستخدم ON DELETE RESTRICT (لا SET NULL ولا CASCADE) ليُحافَظ
-- على الأثر التاريخي لأي صنف مُستخدَم في طلبات قائمة — حتى لو حُذف ناعماً.
-- ============================================================================
--> statement-breakpoint

ALTER TABLE order_component
  ADD COLUMN IF NOT EXISTS catalog_component_id uuid
  REFERENCES catalog_component(id) ON DELETE RESTRICT;

--> statement-breakpoint

-- فهرس جزئي يحصر فقط الصفوف المرتبطة (التي تحمل id غير NULL). هذا يُبقي الفهرس
-- صغيراً لأن المكوّنات الحرّة (free-text) لن تُدرَج فيه. استعلامات Phase 3
-- (deductForDelivery) ستستخدم هذا الفهرس: WHERE catalog_component_id IS NOT NULL.
CREATE INDEX IF NOT EXISTS order_component_catalog_idx
  ON order_component(catalog_component_id)
  WHERE catalog_component_id IS NOT NULL;
