-- ============================================================================
-- migration 0018 — تصنيف التكاليف بُعدين (رأسمالي/تشغيلي × ثابت/متغيّر)
-- ============================================================================
-- الغاية: تمييز المصاريف والمشتريات الرأسمالية (الآلات، الأثاث) عن التشغيلية،
-- وتمييز التكاليف الثابتة (الإيجار، الرواتب) عن المتغيّرة (الخامات، التغليف).
-- الربح التشغيلي يستثني الرأسمالي؛ الرأسمالي يظهر سطراً منفصلاً في الميزانية.
--
-- الافتراضي للصفوف القديمة (backfill تلقائي عبر DEFAULT):
--   is_capital_asset = false (DEFAULT NOT NULL)
--   cost_nature = NULL (nullable)
-- هذا يعني: كل صف قديم يُعامَل كأنه «تشغيلي-متغيّر» ضمنياً — يُطرح من P&L
-- التشغيلي كما كان يُطرح دائماً. لا تغيير على الأرقام القائمة.
--
-- ⚠️ CRITICAL-NOTE-1 (حُلَّ): CHECK في البطاقة الأصلية للـ spec كان:
--     `is_capital_asset = true OR cost_nature IN ('fixed','variable')`
--   هذا يرفض (false, NULL) — فيُكسر الـ backfill (الصفوف القديمة كلها false/NULL).
--   الحل (المُتَّبع هنا): توسيع الـ CHECK لقبول NULL عند is_capital_asset=false:
--     `is_capital_asset = true OR cost_nature IS NULL OR cost_nature IN ('fixed','variable')`
--   هذا يسمح (false, NULL) للصفوف القديمة، ويفرض (false, 'fixed'|'variable')
--   للصفوف الجديدة التي تُحدِّد cost_nature صراحةً، ويسمح (true, NULL) للرأسمالي
--   (طبيعة التكلفة لا معنى لها للأصول الرأسمالية — يجري إهلاكها لاحقاً).
--
-- آمن للتشغيل المتكرر (idempotent): كل خطوة محروسة بـ IF [NOT] EXISTS أو
-- DO $$ ... END $$ لـ CHECK constraint.
-- ============================================================================
--> statement-breakpoint

-- 1. أعمدة التصنيف على expense
ALTER TABLE expense ADD COLUMN IF NOT EXISTS is_capital_asset boolean NOT NULL DEFAULT false;
ALTER TABLE expense ADD COLUMN IF NOT EXISTS cost_nature text;

--> statement-breakpoint

-- 2. CHECK على expense (موسَّع لقبول NULL عند is_capital=false — انظر CRITICAL-NOTE-1)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_classification_check') THEN
    ALTER TABLE expense ADD CONSTRAINT expense_classification_check
      CHECK (is_capital_asset = true OR cost_nature IS NULL OR cost_nature IN ('fixed','variable'));
  END IF;
END $$;

--> statement-breakpoint

-- 3. فهرس جزئي على is_capital_asset للصفوف النشطة فقط — يُسرِّع فلتر «الرأسمالي»
--    في computeOperatingPnl و UI الـ tabs.
CREATE INDEX IF NOT EXISTS expense_capital_idx
  ON expense(is_capital_asset)
  WHERE deleted_at IS NULL;

--> statement-breakpoint

-- 4. أعمدة التصنيف على purchase
ALTER TABLE purchase ADD COLUMN IF NOT EXISTS is_capital_asset boolean NOT NULL DEFAULT false;
ALTER TABLE purchase ADD COLUMN IF NOT EXISTS cost_nature text;

--> statement-breakpoint

-- 5. CHECK على purchase (نفس منطق expense)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_classification_check') THEN
    ALTER TABLE purchase ADD CONSTRAINT purchase_classification_check
      CHECK (is_capital_asset = true OR cost_nature IS NULL OR cost_nature IN ('fixed','variable'));
  END IF;
END $$;

--> statement-breakpoint

-- 6. فهرس جزئي على purchase.is_capital_asset
CREATE INDEX IF NOT EXISTS purchase_capital_idx
  ON purchase(is_capital_asset)
  WHERE deleted_at IS NULL;
