-- ============================================================================
-- migration 0022 — جدول الأصول الرأسمالية المُهلَكة (capital_asset)
-- ============================================================================
-- الغاية: تخزين قرار الإهلاك لكل تكلفة رأسمالية (آلة، أثاث، معدات). عند إنشاء
-- هذا الصف، يبدأ النظام بخصم monthly_depreciation_cents شهرياً من الربح التشغيلي
-- عبر computeOperatingPnl (محسوب عند القراءة — خيار γ، لا CRON ولا جدول شهري).
--
-- العلاقة مع جداول Phase 2:
--   - expense / purchase لهما is_capital_asset (boolean) يُحدِّد أن الصف رأسمالي.
--   - capital_asset هو جدول مستقل يُخزِّن قرار الإهلاك لصف رأسمالي محدَّد (اختياري).
--   - مصدر الربط: source_type ('expense' | 'purchase') + source_id (uuid).
--   - لا FK صريح إلى expense/purchase — العلاقة دلالية (نمط catalog_movement).
--     هذا يُبقي حذف expense/purchase ممكناً دون كسر FK؛ capital_asset يبقى
--     للسجل التاريخي (أو يُحذف ناعماً يدوياً إن أراد المستخدم).
--
-- متى تُكتَب صفوف capital_asset؟
--   - فقط من addCapitalAsset ({sourceType, sourceId, name, purchaseDate,
--     purchaseAmountCents, usefulLifeMonths}) في depreciation/actions.ts.
--   - يُستدعى من ExpenseForm/PurchaseForm بعد حفظ صف رأسمالي، خلف toggle
--     «تصنيف متقدّم» (بطاقة 4.E). إن اختار المستخدم «خصم مرة واحدة» لا يُنشئ
--     صف capital_asset (يكفي is_capital_asset=true على expense/purchase —
--     يظهر سطر «إضافات أصول رأسمالية» منفصل في الميزانية).
--
-- متى تُحذَف ناعماً؟
--   - حالياً لا يوجد UI لحذف صف capital_asset. الإهلاك يستمر حتى انقضاء العمر
--     النافع. للحذف المستقبلي: deleted_at = now() (نمط INV-5).
--
-- الحقول:
--   - id: uuid PRIMARY KEY DEFAULT gen_random_uuid().
--   - source_type: 'expense' | 'purchase' (CHECK constraint).
--   - source_id: uuid NOT NULL (لا FK — راجع أعلاه).
--   - name: text NOT NULL (يُستخدَم للعرض في IC-14 والتقارير).
--   - purchase_date: date NOT NULL (تاريخ الشراء الأصلي — للعرض فقط).
--   - purchase_amount_cents: integer NOT NULL (قيمة الشراء الأصلية بالـ fils).
--   - useful_life_months: integer NOT NULL CHECK > 0 (العمر النافع بالأشهر).
--   - monthly_depreciation_cents: integer NOT NULL (= floor(amount / life)).
--   - started_at: timestamptz NOT NULL DEFAULT now() — تاريخ بداية الإهلاك
--     (لحظة إنشاء الصف، لا تاريخ الشراء الأصلي. راجع التعليق في depreciation/db.ts).
--   - deleted_at, created_at, updated_at: نمط INV-5.
--
-- آمن للتشغيل المتكرر (idempotent): CREATE TABLE IF NOT EXISTS + CREATE INDEX
-- IF NOT EXISTS + DO $$ blocks لـ CHECK constraints والـ trigger (نمط 0020).
-- ============================================================================
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS capital_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  name text NOT NULL,
  purchase_date date NOT NULL,
  purchase_amount_cents integer NOT NULL,
  useful_life_months integer NOT NULL,
  monthly_depreciation_cents integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capital_asset_source_type_enum') THEN
    ALTER TABLE capital_asset ADD CONSTRAINT capital_asset_source_type_enum
      CHECK (source_type IN ('expense','purchase'));
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capital_asset_useful_life_positive') THEN
    ALTER TABLE capital_asset ADD CONSTRAINT capital_asset_useful_life_positive
      CHECK (useful_life_months > 0);
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capital_asset_amount_nonnegative') THEN
    ALTER TABLE capital_asset ADD CONSTRAINT capital_asset_amount_nonnegative
      CHECK (purchase_amount_cents >= 0);
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capital_asset_monthly_dep_nonnegative') THEN
    ALTER TABLE capital_asset ADD CONSTRAINT capital_asset_monthly_dep_nonnegative
      CHECK (monthly_depreciation_cents >= 0);
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'capital_asset_name_length') THEN
    ALTER TABLE capital_asset ADD CONSTRAINT capital_asset_name_length
      CHECK (char_length(name) <= 200);
  END IF;
END $$;

--> statement-breakpoint

-- فهرس (source_type, source_id) WHERE deleted_at IS NULL — يُسرِّع البحث عن
-- capital_asset المرتبط بصف expense/purchase محدَّد (لمنع التكرار، وللحذف الناعم
-- المستقبلي عند حذف expense/purchase). فلتر WHERE deleted_at IS NULL يُبقي
-- الفهرس صغيراً.
CREATE INDEX IF NOT EXISTS capital_asset_source_idx
  ON capital_asset(source_type, source_id)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- فهرس started_at WHERE deleted_at IS NULL — يُسرِّع استعلام الإهلاك في
-- computeOperatingPnl و IC-14 (يُفلتر دائماً WHERE deleted_at IS NULL AND
-- started_at::date <= asOfDate).
CREATE INDEX IF NOT EXISTS capital_asset_started_at_idx
  ON capital_asset(started_at)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- Trigger set_updated_at: الدالة موجودة في lib/db/triggers.sql (مُعرَّفة مسبقاً
-- على purchase/expense/sale/order/order_component/catalog_movement). نُرفقها هنا
-- بـ capital_asset لضمان تحديث updated_at تلقائياً عند UPDATE (يتسق مع باقي
-- الجداول). المُرفَق آمن: CREATE TRIGGER IF NOT EXISTS غير مدعوم في pg < 15،
-- فنستخدم DO $$ (نمط migration 0020).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'capital_asset_set_updated_at') THEN
    CREATE TRIGGER capital_asset_set_updated_at
      BEFORE UPDATE ON capital_asset
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
