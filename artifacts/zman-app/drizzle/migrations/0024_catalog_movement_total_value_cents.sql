-- ============================================================================
-- migration 0024 — إصلاح انحراف كسور الـ fils في قيمة المخزون + A4 backfill
-- ============================================================================
-- الغاية الأساسية (SA1 / A1 fix): قبل هذا الـ migration، قيمة المخزون في
-- الميزانية (getFinancialPosition.inventoryValueCents) كانت تُحسَب من
-- `qty × floor(totalCents / qty)` لكل حركة `in` من purchase. عند شراء كمية لا
-- تقبل القسمة على totalCents (مثلاً 3 وحدات بـ 1000 fils → floor(1000/3) = 333
-- لكل وحدة → قيمة المخزون = 999 بدل 1000)، يظهر equityDrift بمقدار الفرق
-- (−1 fils في المثال). هذا الانحراف تراكمي عبر كل عملية شراء غير قابلة للقسمة.
--
-- الحل: إضافة عمود `total_value_cents bigint` على catalog_movement يُخزِّن
-- إجمالي قيمة الحركة بالـ fils (عدد صحيح، بلا تقريب). للحركة `in` من purchase
-- = purchase.totalCents (مطابقاً لمبلغ الصندوق المخصوم بالضبط). للحركة `out`
-- من order_delivery / manual_out = qty × unit_cost_cents (= COGS). الاستعلامات
-- تُفضِّل total_value_cents وتتحوّل إلى `qty × coalesce(unit_cost_cents, 0)`
-- كـ fallback للحركات القديمة (قبل هذا الـ migration) التي لا تملك العمود.
--
-- الغاية الثانوية (SA1 / A2 fix): adjustStock مع direction='out' لم يكن يمرِّر
-- unit_cost_cents للحركة → قيمة المخزون لم تكن تُخصَم عند الصرف اليدوي → الأصول
-- مُضخَّمة. الإصلاح في الكود (inventory/actions.ts) يحسب التكلفة الوسطية المرجَّحة
-- من الحركات `in` النشطة ويمرِّرها. هذا الـ migration لا يتدخّل في هذه العملية
-- (هي عملية جديدة كلياً) لكنه يضمن أن الـ backfill للحركات اليدوية القديمة
-- (manual_out بلا unit_cost) يبقى متسقاً (الـ fallback = qty × 0 = 0).
--
-- الغاية الثالثة (SA1 / A4 fix — PRE-DEPLOY): migration 0023 ضبط
-- `is_tracked_inventory = true` على مشتريات قديمة (مرتبطة بصنف متتبَّع) لكنه
-- لـم يُنشئ حركات catalog_movement `in` لها. هذا ترك الميزانية غير متوازنة
-- لتلك المشتريات (cash نزل بمبلغ الشراء، لكن inventoryValueCents = 0، ولا
-- cogsCentsToDate — فالـ equityDrift = -purchase.totalCents). نُنشئ هنا الحركات
-- المفقودة بشكل idempotent (WHERE NOT EXISTS).
--
-- آمن للتشغيل المتكرر (idempotent):
--   - ADD COLUMN IF NOT EXISTS للعمود الجديد.
--   - كل UPDATE محروس بـ `WHERE total_value_cents IS NULL` (لا يُعيد كتابة قيمة
--     موجودة).
--   - INSERT المفقود محروس بـ NOT EXISTS (لا يُكرِّر الإدراج).
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- (1) إضافة عمود total_value_cents على catalog_movement
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE catalog_movement
  ADD COLUMN IF NOT EXISTS total_value_cents bigint;

--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- (2) Backfill — حركات `in` من purchase: total_value_cents = purchase.totalCents
-- ───────────────────────────────────────────────────────────────────────────
-- JOIN مع purchase على (source_type='purchase' AND source_id=purchase.id).
-- شرط `cm.total_value_cents IS NULL` يضمن idempotency (لا يُعاد الكتابة).
-- purchase.totalCents = العدد الصحيح الأصلي (لا تقريب) — مطابقاً لمبلغ
-- الصندوق المخصوم. هذا يُصلِح الـ drift التاريخي للحركات القائمة.
UPDATE catalog_movement AS cm
SET total_value_cents = p.total_cents,
    updated_at = now()
FROM purchase AS p
WHERE cm.source_type = 'purchase'
  AND cm.source_id = p.id
  AND cm.direction = 'in'
  AND cm.deleted_at IS NULL
  AND cm.total_value_cents IS NULL;

--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- (3) Backfill — حركات `out` من order_delivery / manual_out / adjustment:
--     total_value_cents = quantity × COALESCE(unit_cost_cents, 0)
-- ───────────────────────────────────────────────────────────────────────────
-- هذه الحركات لها unit_cost_cents معرَّفة (من deductForDelivery) أو NULL
-- (من adjustStock اليدوي القديم بلا سعر). في كلتا الحالتين، total_value_cents
-- = qty × COALESCE(unit_cost_cents, 0) يطابق القيمة التي كانت تُحسَب وقت
-- القراءة قبل هذا الـ migration — فلا يظهر drift جديد. شرط `IS NULL` يضمن
-- idempotency.
UPDATE catalog_movement
SET total_value_cents = quantity * COALESCE(unit_cost_cents, 0),
    updated_at = now()
WHERE direction = 'out'
  AND deleted_at IS NULL
  AND total_value_cents IS NULL;

--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- (4) A4 fix — Backfill guard: إنشاء حركات `in` مفقودة لمشتريات متتبَّعة قديمة
-- ───────────────────────────────────────────────────────────────────────────
-- migration 0023 ضبط is_tracked_inventory=true على مشتريات قديمة مرتبطة بصنف
-- متتبَّع، لكنه لم يُنشئ لها حركات catalog_movement. هذا أدى إلى:
--   - cash نزل بمبلغ الشراء (cash_movement موجود).
--   - inventoryValueCents = 0 (لا يوجد صف catalog_movement في المجموع).
--   - cogsCentsToDate = 0 (لا توجد حركة out مرتبطة ببيع).
--   - operatingPurchasesCents = 0 (الشراء مُستبعَد لأن is_tracked_inventory=true).
--   → equityDrift = -purchase.totalCents.
--
-- نُنشئ هنا الحركة `in` المفقودة لكل purchase حيث:
--   - is_tracked_inventory = true (مُرأسمَل كمخزون)
--   - linked_catalog_component_id IS NOT NULL (مرتبط بصنف)
--   - deleted_at IS NULL (purchase نشط)
--   - لا توجد حركة catalog_movement نشطة لها source_type='purchase' AND
--     source_id = purchase.id.
--
-- unit_cost_cents = floor(total_cents / quantity) (Math.floor — Fils discipline).
-- total_value_cents = total_cents (العدد الصحيح الأصلي، بلا تقريب).
--
-- Idempotent: NOT EXISTS في WHERE يمنع الإدراج المكرَّر. لو أُعيد تشغيل الـ
-- migration بعد أن أُنشئت الحركة، لا يُدرَج شيء. لو أُنشِئت حركة جديدة عبر
-- createPurchase لاحقاً، لا يُدرَج شيء (الـ NOT EXISTS يصدّها).
--
-- ⚠️ ملاحظة مستقبلية (FUTURE GUARD): أي migration مستقبلي يضبط
-- is_tracked_inventory=true على صفوف purchase قديمة يجب أن يُنشئ أيضاً حركة
-- catalog_movement `in` مطابقة. وإلا سيظهر equityDrift. لفحص ذلك بعد أي
-- backfill مستقبلي، شغِّل استعلام الكشف أدناه (مُوثَّق في رأس الملف).
INSERT INTO catalog_movement (
  id, date, catalog_component_id, direction, quantity,
  source_type, source_id, order_component_id,
  unit_cost_cents, total_value_cents, notes,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  p.date,
  p.linked_catalog_component_id,
  'in',
  p.quantity,
  'purchase',
  p.id,
  NULL,
  CASE WHEN p.quantity > 0 THEN floor(p.total_cents / p.quantity) ELSE 0 END,
  p.total_cents,
  'Backfill من migration 0024 — حركة مخزون مفقودة لشراء متتبَّع قديم (A4 fix)',
  now(),
  now()
FROM purchase p
WHERE p.is_tracked_inventory = true
  AND p.linked_catalog_component_id IS NOT NULL
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM catalog_movement cm
    WHERE cm.source_type = 'purchase'
      AND cm.source_id = p.id
      AND cm.deleted_at IS NULL
  );

--> statement-breakpoint

-- ───────────────────────────────────────────────────────────────────────────
-- (5) استعلام كشف ما بعد التشغيل (POST-DEPLOY VERIFICATION QUERY)
-- ───────────────────────────────────────────────────────────────────────────
-- بعد تطبيق هذا الـ migration، شغِّل الاستعلام التالي على قاعدة البيانات
-- الحية للتأكد من عدم وجود مشتريات متتبَّعة بحركة مخزون مفقودة. يجب أن
-- يُرجِع 0 صفوف. لو رجع صفوفاً، فهناك خطأ في الـ backfill (مثلاً purchase
-- أُنشئ بعد تطبيق الـ migration بدون أن تُنشئ الكود حركته — احتمال نادر
-- جداً بعد إصلاح SA1).
--
--   SELECT p.id, p.date, p.item, p.quantity, p.total_cents
--   FROM purchase p
--   WHERE p.is_tracked_inventory = true
--     AND p.deleted_at IS NULL
--     AND p.linked_catalog_component_id IS NOT NULL
--     AND NOT EXISTS (
--       SELECT 1 FROM catalog_movement cm
--       WHERE cm.source_type = 'purchase'
--         AND cm.source_id = p.id
--         AND cm.deleted_at IS NULL
--     );
--
-- ───────────────────────────────────────────────────────────────────────────
-- (6) FUTURE GUARD — لأي backfill مستقبلي يضبط is_tracked_inventory=true
-- ───────────────────────────────────────────────────────────────────────────
-- لو أردت لاحقاً ضبط is_tracked_inventory=true على مشتريات قديمة إضافية
-- (مثلاً اكتشاف صنف كان يجب أن يكون متتبَّعاً)، يجب تطبيق نفس النمط:
--   1) ضبط is_tracked_inventory=true على purchase.
--   2) INSERT حركة catalog_movement `in` محروسة بـ NOT EXISTS (نفس الخطوة 4).
-- بدون الخطوة 2، سيظهر equityDrift بمقدار purchase.totalCents لكل صف جديد.
-- راجع SA1 worklog للحصول على تفاصيل القرار.
-- ============================================================================
