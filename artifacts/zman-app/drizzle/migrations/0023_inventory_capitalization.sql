-- ============================================================================
-- migration 0023 — رأسمَلة المخزون المتتبَّع + إصلاح D6 (FK على order_component_id)
-- ============================================================================
-- الغاية (D4 fix): للأصناف المتتبَّعة فقط (catalog_component.tracked=true)،
-- يُرأسمَل الشراء كمخزون (لا يخفض الربح التشغيلي في شهر الشراء)؛ التكلفة
-- تُخصَم عند البيع عبر COGS محسوب عند القراءة من catalog_movement out (مثل
-- الإهلاك — تعديل غير نقدي). الأصناف غير المتتبَّعة تبقى تشغيلية بحتة كما في
-- INV-1 الأصلي. هذا استثناء مقصود لـ INV-1 موثَّق في §9 (INV-22 / INV-23)
-- و§0 من ACCOUNTING_RULES.md، يُحاكي أنموذج Phase 4 (الإهلاك غير النقدي).
--
-- الغاية (D6 fix): يضيف الـ FK المفقود على catalog_movement.order_component_id
-- (الـ ORM في inventory/db.ts يُعلِن references(() => orderComponent.id) لكن
-- migration 0020 أنشأ العمود بلا REFERENCES — فالقاعدة الحية بلا قيد). كما
-- ينظِّف أي صفوف يتيمة قبل الإضافة (defensive — العمود nullable أصلاً).
--
-- آمن للتشغيل المتكرر (idempotent): كل خطوة محروسة بـ IF [NOT] EXISTS أو
-- DO $$ ... IF NOT EXISTS (... pg_constraint/pg_attribute ...).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- (1) D4 — أعمدة رأسمَلة المخزون المتتبَّع
-- ───────────────────────────────────────────────────────────────────────────

-- 1أ. is_tracked_inventory على purchase: يُضبَط تلقائياً على true متى كان
-- linkedCatalogComponentId يشير لصنف متتبَّع. computeOperatingPnl يستثني
-- هذه المشتريات من operatingPurchasesCents (الشراء يُرأسمَل كمخزون).
ALTER TABLE purchase
  ADD COLUMN IF NOT EXISTS is_tracked_inventory boolean NOT NULL DEFAULT false;

--> statement-breakpoint

-- 1ب. unit_cost_cents على catalog_movement: سعر الوحدة بالـ fils لكل وحدة
-- عند تسجيل الحركة. للحركة `in` من purchase = floor(totalCents / quantity).
-- للحركة `out` من order_delivery = التكلفة الوسطية المرجَّحة لحظة البيع.
-- nullable — يستعمل فقط للأصناف المتتبَّعة.
ALTER TABLE catalog_movement
  ADD COLUMN IF NOT EXISTS unit_cost_cents bigint;

--> statement-breakpoint

-- 1ج. Backfill: ضبط is_tracked_inventory = true لكل صف purchase قائم مرتبط
-- بصنف متتبَّع. هذا يحافظ على اتساق الدفتر القائم مع النموذج الجديد (لا
-- تُعاد معالجة تاريخية — ببساطة نُعلِم computeOperatingPnl أن هذه المشتريات
-- كانت لمخزون متتبَّع فتُستبعَد من operatingPurchasesCents من الآن فصاعداً).
UPDATE purchase
SET is_tracked_inventory = true,
    updated_at = now()
WHERE linked_catalog_component_id IS NOT NULL
  AND linked_catalog_component_id IN (
    SELECT id FROM catalog_component WHERE tracked = true
  )
  AND is_tracked_inventory = false;

--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- (2) D6 — FK المفقود على catalog_movement.order_component_id + تنظيف اليتامى
-- ───────────────────────────────────────────────────────────────────────────

-- 2أ. تنظيف دفاعي: أي صف catalog_movement يحمل order_component_id غير موجود
-- في order_component (نتيجة محتملة لإعادة إنشاء order_component في
-- updateOrder القديم قبل إصلاح D6). العمود nullable، فلا ضرر من التعيين NULL.
UPDATE catalog_movement
SET order_component_id = NULL,
    updated_at = now()
WHERE order_component_id IS NOT NULL
  AND order_component_id NOT IN (SELECT id FROM order_component);

--> statement-breakpoint

-- 2ب. إضافة الـ FK المفقود. التسمية تطابق اصطلاح Drizzle التلقائي
-- (catalog_movement_order_component_id_order_component_id_fk). ON DELETE RESTRICT
-- يُحافِظ على الأثر التاريخي (لا يمكن حذف مكوّن طلب مرتبط بحركة مخزون قائمة).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'catalog_movement_order_component_id_order_component_id_fk'
  ) THEN
    ALTER TABLE catalog_movement
      ADD CONSTRAINT catalog_movement_order_component_id_order_component_id_fk
      FOREIGN KEY (order_component_id) REFERENCES order_component(id)
      ON DELETE RESTRICT;
  END IF;
END $$;
