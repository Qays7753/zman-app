-- ═══════════════════════════════════════════════════════════════════
-- سكربت إصلاح لمرة واحدة: الطلبات المكتملة (delivered) بلا سجل مبيعات
-- ═══════════════════════════════════════════════════════════════════
-- المشكلة: طلبات وصلت حالة delivered عبر تغيير الحالة المجرّد (بلا
-- convertOrderToSale)، فلم يُنشأ لها سجل sale ولا حركة صندوق للمتبقّي.
-- النتيجة: تظهر مكتملة لكن مبيعاتها = صفر (مثل: هلا، هبة الله).
--
-- هذا السكربت:
--   1. يجد كل طلب delivered غير محذوف بلا sale مرتبط (غير محذوف).
--   2. ينشئ سجل sale بقيمة السعر الكامل (نفس ما يفعله convertOrderToSale).
--   3. ينشئ حركة صندوق (in) للمبلغ المتبقّي (السعر − العربون) فقط،
--      لأن العربون دخل الصندوق سابقاً عند إنشاء الطلب.
--
-- شغّله مرة واحدة في Supabase SQL Editor. آمن (idempotent): إعادة تشغيله
-- لن تكرّر المبيعات لأنه يستثني الطلبات التي لها sale بالفعل.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  rec RECORD;
  v_sale_id uuid;
  v_account_id uuid;
  v_remainder integer;
BEGIN
  -- الحساب النقدي الافتراضي (نفس المستخدم في التطبيق)
  SELECT id INTO v_account_id
  FROM account
  WHERE type = 'cash' AND name = 'الصندوق الرئيسي' AND deleted_at IS NULL
  LIMIT 1;

  -- إن لم يوجد، أنشئه
  IF v_account_id IS NULL THEN
    INSERT INTO account (name, type, opening_balance_cents)
    VALUES ('الصندوق الرئيسي', 'cash', 0)
    RETURNING id INTO v_account_id;
  END IF;

  -- كل طلب delivered بلا مبيعات مرتبطة (غير محذوفة)
  FOR rec IN
    SELECT o.id, o.total_price_cents, o.deposit_cents, o.received_date, o.customer_name
    FROM "order" o
    WHERE o.status = 'delivered'
      AND o.deleted_at IS NULL
      AND o.total_price_cents > 0
      AND NOT EXISTS (
        SELECT 1 FROM sale s
        WHERE s.order_id = o.id AND s.deleted_at IS NULL
      )
  LOOP
    -- 1. إنشاء سجل المبيعات (السعر الكامل)
    INSERT INTO sale (date, source, order_id, amount_cents, description)
    VALUES (
      COALESCE(rec.received_date, CURRENT_DATE),
      'order',
      rec.id,
      rec.total_price_cents,
      'مبيعات الطلب #' || substring(rec.id::text, 1, 8) || ' (إصلاح لاحق)'
    )
    RETURNING id INTO v_sale_id;

    -- 2. حركة صندوق للمتبقّي فقط (العربون دخل سابقاً)
    v_remainder := rec.total_price_cents - COALESCE(rec.deposit_cents, 0);
    IF v_remainder > 0 THEN
      INSERT INTO cash_movement (date, account_id, direction, amount_cents, source_type, source_id, description)
      VALUES (
        COALESCE(rec.received_date, CURRENT_DATE),
        v_account_id,
        'in',
        v_remainder,
        'sale',
        v_sale_id,
        'متبقي مبيعات الطلب #' || substring(rec.id::text, 1, 8) || ' (إصلاح لاحق)'
      );
    END IF;

    RAISE NOTICE 'أُصلح الطلب: % (%) — مبيعات: %, متبقي للصندوق: %',
      rec.customer_name, rec.id, rec.total_price_cents, v_remainder;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- تحقّق بعد التشغيل: يجب أن تكون النتيجة 0 (لا طلبات delivered بلا مبيعات)
-- ═══════════════════════════════════════════════════════════════════
SELECT COUNT(*) AS delivered_without_sale
FROM "order" o
WHERE o.status = 'delivered'
  AND o.deleted_at IS NULL
  AND o.total_price_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM sale s WHERE s.order_id = o.id AND s.deleted_at IS NULL
  );
