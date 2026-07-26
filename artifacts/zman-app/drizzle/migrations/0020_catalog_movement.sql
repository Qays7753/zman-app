-- ============================================================================
-- migration 0020 — دفتر حركة المخزون (catalog_movement)
-- ============================================================================
-- الغاية: جدول مستقل لتسجيل حركات المخزون الفيزيائي (in/out) لكل صنف متتبَّع.
-- هذا الدفتر **تشغيلي بحت** — لا يدخل P&L، لا الميزانية، لا حقوق الملكية، لا
-- حركة الصندوق. يُستخدَم لعرض الرصيد المتاح في الـ picker وللتحذيرات فقط.
--
-- متى تُكتَب الحركة؟
--   - 'in'  من source_type='purchase' داخل createPurchase (إن كان الصنف متتبَّعاً).
--   - 'in'  من source_type='opening' عند تفعيل التتبّع لأول مرة مع رصيد افتتاحي.
--   - 'in'  من source_type='manual_in' عبر adjustStock (تسوية يدوية موجبة).
--   - 'out' من source_type='order_delivery' داخل convertOrderToSale — source_id=sale.id،
--           order_component_id=المكوّن المرتبط.
--   - 'out' من source_type='manual_out' عبر adjustStock (تسوية يدوية سالبة — صرف يدوي).
--   - 'out' من source_type='adjustment' (تسوية عامة، نادر).
--
-- متى تُحذَف ناعماً؟
--   - داخل reverseSale: كل حركة out بحيث source_id = sale.id → deleted_at = now().
--   - عند تعديل purchase مرتبط: الحركة القديمة محذوفة ناعماً قبل إدراج الجديدة.
--
-- آمن للتشغيل المتكرر (idempotent): CREATE TABLE IF NOT EXISTS + CREATE INDEX
-- IF NOT EXISTS + DO $$ blocks لـ CHECK constraints والـ trigger.
--
-- الترتيب الإجباري للمرحلة 3: 0019 (tracked) → 0021 (purchase link) → 0020 (هذا).
-- ============================================================================
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS catalog_movement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  date date NOT NULL,
  catalog_component_id uuid NOT NULL REFERENCES catalog_component(id) ON DELETE RESTRICT,
  direction text NOT NULL,
  quantity integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  order_component_id uuid,
  notes text NOT NULL DEFAULT '',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_movement_direction_enum') THEN
    ALTER TABLE catalog_movement ADD CONSTRAINT catalog_movement_direction_enum
      CHECK (direction IN ('in','out'));
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_movement_source_type_enum') THEN
    ALTER TABLE catalog_movement ADD CONSTRAINT catalog_movement_source_type_enum
      CHECK (source_type IN ('purchase','order_delivery','opening','adjustment','manual_in','manual_out'));
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_movement_quantity_positive') THEN
    ALTER TABLE catalog_movement ADD CONSTRAINT catalog_movement_quantity_positive
      CHECK (quantity > 0);
  END IF;
END $$;

--> statement-breakpoint

-- فهرس يجمع (catalog_component_id, date DESC) — يُسرِّع استعلام الرصيد التراكمي
-- وحركات الصنف في الـ picker. فلتر WHERE deleted_at IS NULL يُبقي الفهرس صغيراً.
CREATE INDEX IF NOT EXISTS catalog_movement_component_date_idx
  ON catalog_movement(catalog_component_id, date DESC)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- فهرس (source_type, source_id) — يُسرِّع البحث عن كل الحركات المرتبطة بـ sale
-- (في reverseSale و getCatalogMovementsForOrder) أو بـ purchase (في updatePurchase).
CREATE INDEX IF NOT EXISTS catalog_movement_source_idx
  ON catalog_movement(source_type, source_id)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- Trigger set_updated_at: الدالة موجودة في lib/db/triggers.sql (مُعرَّفة مسبقاً
-- على purchase/expense/sale/order/order_component). نُرفقها هنا بـ catalog_movement
-- لضمان تحديث updated_at تلقائياً عند UPDATE (يتسق مع باقي الجداول).
-- المُرفَق آمن: CREATE TRIGGER IF NOT EXISTS غير مدعوم في pg < 15، فنستخدم DO $$.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'catalog_movement_set_updated_at') THEN
    CREATE TRIGGER catalog_movement_set_updated_at
      BEFORE UPDATE ON catalog_movement
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
