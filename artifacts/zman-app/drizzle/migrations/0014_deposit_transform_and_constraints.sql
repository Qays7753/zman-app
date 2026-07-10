-- ============================================================================
-- migration 0014 — تحويل العربون إلى مبيعات عند التسليم + قيود DB جديدة
-- ============================================================================
-- (أ) ترحيل بيانات لمرة واحدة: كل حركة deposit نشطة لطلب مُسلَّم تُعاد
--     تصنيفها إلى sale وتربط بمبيعة الطلب. هذا يصحّح البيانات التاريخية
--     لتتوافق مع سلوك convertOrderToSale الجديد.
-- (ب) قيد DB: deposit_cents <= total_price_cents + additional_profit_cents.
-- (ج) قيد DB: sale.source = 'order' يتطلب order_id NOT NULL.
-- (د) ترحيل تاريخي لـ sale.amountCents: تضمين additional_profit_cents في
--     المبيعات المُسلَّمة سابقاً.
-- ============================================================================
-- آمن للتشغيل المتكرر (idempotent). يُشغَّل بعد نشر كود convertOrderToSale
-- الجديد وقبل فتح لوحة القيادة.
-- ============================================================================

-- (أ) إعادة تصنيف حركات العربون القديمة للطلبات المُسلَّمة
--> statement-breakpoint
UPDATE cash_movement cm
SET
  source_type = 'sale',
  source_id = s.id,
  description = COALESCE(cm.description, 'مبيعات محوَّلة من عربون (ترحيل تلقائي)')
    || ' (محوَّل من عربون)',
  updated_at = now()
FROM "order" o
JOIN sale s ON s.order_id = o.id AND s.deleted_at IS NULL
WHERE cm.source_type = 'deposit'
  AND cm.source_id = o.id
  AND cm.deleted_at IS NULL
  AND o.status = 'delivered'
  AND o.deleted_at IS NULL;

-- (د) تحديث sale.amountCents التاريخية لتشمل additional_profit_cents.
--     قبل هذا الترحيل، sale.amountCents = totalPriceCents فقط. بعده،
--     sale.amountCents = totalPriceCents + additionalProfitCents.
--> statement-breakpoint
UPDATE sale s
SET
  amount_cents = s.amount_cents + COALESCE(o.additional_profit_cents, 0),
  updated_at = now()
FROM "order" o
WHERE s.order_id = o.id
  AND s.source = 'order'
  AND s.deleted_at IS NULL
  AND o.status = 'delivered'
  AND o.deleted_at IS NULL
  AND COALESCE(o.additional_profit_cents, 0) > 0
  AND s.amount_cents = o.total_price_cents;

-- (ب) قيد DB: العربون لا يتجاوز الإيراد المحقَّق الكامل
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_deposit_not_exceeds_realized') THEN
    ALTER TABLE "order" ADD CONSTRAINT "order_deposit_not_exceeds_realized"
      CHECK (deposit_cents <= total_price_cents + additional_profit_cents);
  END IF;
END $$;

-- (ج) قيد DB: مبيعة مصدرها 'order' تتطلب order_id
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_order_source_requires_order_id') THEN
    ALTER TABLE sale ADD CONSTRAINT "sale_order_source_requires_order_id"
      CHECK (source <> 'order' OR order_id IS NOT NULL);
  END IF;
END $$;

-- (هـ) تحقق: لا يجب أن تبقى أي حركة deposit نشطة لطلب مُسلَّم أو ملغى.
--     إذا عادت صفوف، فهناك بيانات غير متوقعة — يجب مراجعتها يدوياً.
--> statement-breakpoint
DO $$
DECLARE
  stale_count integer;
BEGIN
  SELECT count(*) INTO stale_count
  FROM cash_movement cm
  JOIN "order" o ON cm.source_id = o.id
  WHERE cm.source_type = 'deposit'
    AND cm.deleted_at IS NULL
    AND o.status IN ('delivered', 'cancelled')
    AND o.deleted_at IS NULL;
  IF stale_count > 0 THEN
    RAISE WARNING 'Migration 0014: % stale deposit movements remain on delivered/cancelled orders. Review manually.', stale_count;
  END IF;
END $$;
