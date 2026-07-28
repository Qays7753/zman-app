-- ============================================================================
-- migration 0025 — عمود is_inventory_writeoff على expense (A-1 fix, Round 4)
-- ============================================================================
-- الغاية: تمييز مصاريف «هدر/تلف مخزون» غير النقدية عن باقي المصاريف النقدية.
--
-- السياق: adjustStock(direction='out') كانت تُنشئ حركة catalog_movement `out`
-- تُخفِض inventoryValueCents في الميزانية دون أن تُنشئ أي قيد مقابل يُخفِض
-- retainedProfitCents بنفس المقدار. النتيجة: equityDriftCents = -totalValueCents
-- وbalanced=false بعد أي تسوية يدوية سالبة (الخطأ A-1).
--
-- الحل المعتمد (SA1 Round 4 — Option A):
--   1. adjustStock يُنشئ في نفس الـ transaction صف expense جديد بـ:
--        category = 'هدر/تلف مخزون'
--        amount_cents = total_value_cents (المخصوم من المخزون)
--        is_capital_asset = false
--        cost_nature = 'variable'
--        is_inventory_writeoff = true  ← هذا العمود
--      ولا يُنشئ أي cash_movement (الخسارة غير نقدية — مثل COGS).
--   2. computeOperatingPnl يضيف بنداً جديداً inventoryWriteOffCents يقرأ مباشرة
--      من expense حيث is_inventory_writeoff=true (لا عبر cash_movement).
--      يُخصم من operatingNetCents لمطابقة الخسارة بالفترة.
--   3. getFinancialPosition يخصم inventoryWriteOffCentsToDate من retainedProfitCents
--      (إلى جانب cogsCentsToDate) — يحافِظ على IC-1 = 0.
--   4. IC-1 في integrityCheck.ts يُعاد استخدامه getFinancialPosition.equityDriftCents
--      ليتطابق تماماً مع balanced.
--
-- آمن للتشغيل المتكرر (idempotent):
--   - ADD COLUMN IF NOT EXISTS — لا فشل عند الإعادة.
--   - DEFAULT false — لا يحرّم الصفوف القديمة (كل المصاريف القديمة ليست writeoff).
--   - NOT NULL — العمود NOT NULL مع DEFAULT آمنة (Postgres يُbackfill القيمة
--     الافتراضية لكل الصفوف الموجودة عند ALTER TABLE).
--
-- ملاحظة: لا حاجة لـ CHECK constraint. القيمة المنطقية صريحة، ولا توجد قيم
-- أخرى مسموحة. الفهرسة الجزئية تُسرِّع استعلام computeOperatingPnl على
-- المصاريف بهذا العلم فقط (مجموعة صغيرة عادةً).
-- ============================================================================

ALTER TABLE "expense"
  ADD COLUMN IF NOT EXISTS "is_inventory_writeoff" boolean NOT NULL DEFAULT false;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "expense_inventory_writeoff_idx"
  ON "expense" USING btree ("is_inventory_writeoff", "date")
  WHERE is_inventory_writeoff = true AND deleted_at IS NULL;
