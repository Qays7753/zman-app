-- ============================================================================
-- migration 0027 — رقم هاتف الزبون اختياري
-- ============================================================================
-- كان `order.customer_phone` NOT NULL بينما `customer_phone_alt` nullable، أي
-- أن رقماً واحداً على الأقل كان إجبارياً. المالك يستقبل طلبات من زبائن حاضرين
-- في الورشة بلا رقم، فصار الرقمان اختياريَّين معاً.
--
-- خطوتان:
--   1. إسقاط قيد NOT NULL عن customer_phone.
--   2. تطبيع الصفوف القديمة: أي سلسلة فارغة (أو مسافات فقط) في أيٍّ من
--      العمودين تصير NULL — قيمة واحدة تعني «لا رقم» بدل قيمتين. الـ zod
--      schema يطبّق نفس التطبيع على الإدخال الجديد.
--
-- قيود char_length(...) <= 32 تبقى كما هي: PostgreSQL يُقيّم CHECK على NULL
-- كـ UNKNOWN فيمرّ الصف — لا حاجة لتعديلها.
--
-- آمن للتشغيل المتكرر (idempotent): DROP NOT NULL على عمود nullable أصلاً
-- عملية لا أثر لها، والـ UPDATE لا يجد صفوفاً في المرة الثانية.
-- ============================================================================

ALTER TABLE "order" ALTER COLUMN "customer_phone" DROP NOT NULL;
--> statement-breakpoint

UPDATE "order"
SET "customer_phone" = NULL
WHERE "customer_phone" IS NOT NULL AND btrim("customer_phone") = '';
--> statement-breakpoint

UPDATE "order"
SET "customer_phone_alt" = NULL
WHERE "customer_phone_alt" IS NOT NULL AND btrim("customer_phone_alt") = '';
