# قواعد المحاسبة — نظام ZMAN المالي (الدستور الدائم)

> **دستور مالي مُلزِم.** أي مطوّر أو ذكاء اصطناعي يجب أن يقرأ هذا الملف **قبل**
> تعديل أي ملف تحت `src/features/finance/`، `src/features/orders/`،
> `src/features/reports/`، `src/features/dashboard/`، أو أي migration.
> مخالفة أي قاعدة هنا = خطأ، حتى لو «عمل» الكود.
>
> يُفرَض معظم هذه القواعد وقت التشغيل عبر `runFinancialIntegrityCheck`
> في `src/features/finance/integrityCheck.ts` (زر «فحص الآن» في صفحة التقارير).

---

## 0. لماذا الأساس النقدي (لا تُغيّره)

ZMAN ورشة صغيرة. صاحبها يريد أن يعرف «كم نقدًا عندي، كم دخل، كم خرج» — لا
«كم ربحت على الورق». الأساس النقدي:

- **يطابق ذهن صاحب العمل:** «بعتُ اليوم X» = «X دخلت الصندوق اليوم».
- **صحيح بالبناء لورشة أحادية المستخدم:** لا ذمم، لا مستحقات، لا استحقاق يُطابَق.
- **يجعل الميزانية تربط بالصندوق:** الأصول = ما في الصناديق؛ الالتزامات =
  عربونات محتجزة؛ حقوق الملكية = افتتاحي + إيداعات − مسحوبات + أرباح محتجزة.

**لا تُحوّل النظام أبدًا إلى أساس استحقاق أو هجين.** رؤية خطّ الطلبات المتوقّعة
تنتمي لنظام الطلبات (مُسمّاة «متوقّع»)، لا للنظام المالي.

---

## 1. الدفتر المركزي

> **`cash_movement` هو المصدر الوحيد للحقيقة لكل النقد.**

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-1 | كل حدث نقدي (داخل/خارج) يُدرِج حركة `cash_movement` واحدة مقابلة، ولا شيء آخر | IC-2 |
| INV-2 | التحويل يُدرِج زوجًا: `out` واحد و`in` واحد بنفس `sourceId` | IC-2 |
| INV-3 | عربون الطلب يُدرِج حركة `sourceType='deposit'` واحدة عند إنشاء الطلب؛ التحويل لمبيعة يُدرِج `sourceType='sale'` للمتبقّي فقط (`totalPrice − deposit`) لا السعر الكامل | IC-3, IC-4 |
| INV-4 | `createSale`/`updateSale` بمصدر `order` يُرحّلان `max(0, amountCents − order.depositCents)` — لا السعر الكامل أبدًا | IC-4 |
| INV-5 | الحذف الناعم (`deletedAt`) هو الطريق الوحيد للحذف. لا حذف صلب | مراجعة IC-1 |
| INV-6 | كل استعلام تجميعي يفلتر `deletedAt IS NULL` على جدوله الأساسي | IC-1 |

---

## 2. فصل النظام المالي عن الطلبات

> **أرقام الطلبات «متوقّعة». أرقام المالية «نقد محقّق». لا تُجمَع معًا أبدًا.**

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-7 | أرقام الطلبات (`totalPriceCents`، الربح المتوقّع، المتبقّي) لا تُجمَع أبدًا في أي إجمالي مالي (P&L، ميزانية، ملخص اللوحة). الاستثناء الوحيد `order.depositCents` كالتزام — لأن العربون موجود في الدفتر | IC-6 |
| INV-8 | أرقام الطلبات في الواجهة تحمل وسم «متوقّع/تقديري» ولون محايد (`text-ink-2/3`)، لا أخضر/أحمر، ولا إشارة +/− | IC-7 (يدوي) |
| INV-9 | الجسر الوحيد بين الطلبات والمالية = الدفتر: العربون ← `sourceType='deposit'`؛ التحويل ← `sourceType='sale'` للمتبقّي | IC-3, IC-4 |
| INV-10 | إيراد P&L يُشتقّ من `cash_movement(direction='in', sourceType IN ('sale','deposit'))`، لا من `sale.amountCents` | IC-6 |

---

## 3. التسوية

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-11 | `حقوق الملكية من الدفتر = الأصول − الالتزامات` يجب أن تساوي `حقوق الملكية من المكوّنات = افتتاحي + إيداعات − مسحوبات + أرباح محتجزة`. البانر أخضر فقط إن كان `equityDriftCents == 0` | IC-1 |
| INV-12 | صافي P&L (أساس نقدي، كل الفترات) = `retainedProfit + depositsLiability`. `pnlReconciliationCents` يجب أن يكون 0 | IC-6 |

---

## 4. أمان الحسابات

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-13 | أرشفة حساب برصيد غير صفري **مرفوضة**. الرسالة تطلب تحويل الرصيد أولًا | IC-5 |
| INV-14 | `getAccountBalances(includeArchived=false)` يفلتر المؤرشفة على الخادم. من يريد المؤرشفة يطلبها صراحةً | IC-5 |
| INV-15 | جدول `account` **لا يحوي** عمود `openingBalanceCents` (حُذف بـ Migration 0011). الرصيد الافتتاحي من `cash_movement(sourceType='opening')` فقط. حقل الإدخال `openingSeedCents` يُغذّي الدفتر — لا يُخزَّن على صف الحساب | IC-7 |

---

## 5. وحدة المال والتنسيق

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-16 | المال يُخزَّن كأعداد فِلْس صحيحة. العرض يقسم على 1000 (دينار، 3 خانات). مُنسّق واحد مشترك (`formatFilsToJod` من `src/lib/money.ts`). لا قسمة على 100 في أي مكان | IC-7 |
| INV-17 | كل الأعمدة المالية تستخدم لاحقة `*Cents` (رغم أن القيمة فِلْس — تسمية تاريخية). الاستثناء الوحيد `openingSeedCents` | IC-7 (يدوي) |

---

## 6. قائمة «افعل / لا تفعل» للتغييرات المستقبلية

### تعديل `convertOrderToSale` أو `createSale` أو `updateOrder`

**افعل:**
- اقرأ INV-3, INV-4, INV-9, INV-10 قبل أي تعديل.
- بعد تعديلك، اضغط «فحص الآن» (IC-3, IC-4). العربون يجب أن يظهر مرة واحدة؛ متبقّي المبيعة = `totalPrice − deposit`.
- **مهم:** إن عدّلت سعر طلب مُحوّل لمبيعة، يجب أن تُزامن حركة البيع في الدفتر (كما يفعل `updateOrder` الآن بعد إصلاح تباعد السعر).

**لا تفعل أبدًا:**
- لا تجعل `convertOrderToSale` يُرحّل السعر الكامل كـ `sale` (يُضاعف عدّ العربون).
- لا تجعل `createSale` يتخطّى طرح العربون لمصدر `order`.
- لا تجعل `createOrder` يتخطّى ترحيل حركة العربون.

### تعديل الميزانية (`getFinancialPosition`)

**افعل:** اقرأ INV-11, INV-12. بعد تعديلك، تأكّد أن IC-1 و IC-6 = 0. أي مكوّن جديد يُضاف لطرفَي المعادلة معًا.

**لا تفعل أبدًا:** لا تُرجِع فحص التوازن الوهمي القديم (`Math.abs(assets − (liab + equity)) === 0`) — لا يفشل ولا قيمة له. أبقِ `equityDriftCents`.

### إضافة `sourceType` جديد أو نوع حساب جديد

**افعل:** حدّث قيد CHECK في `db.ts`، أضِف migration، حدّث `runFinancialIntegrityCheck`، قرّر إن كان داخلًا/خارجًا/كليهما ووثّقه.

**لا تفعل أبدًا:** لا تُضِف `sourceType` يتجاوز الدفتر. لا تُشِر إلى `account.openingBalanceCents` — العمود غير موجود.

### أي migration

**افعل:** اتبع الاصطلاح `NNNN_name.sql`، idempotent، UP+DOWN، حدّث meta عبر `pnpm drizzle-kit generate`، والتزم بكل الملفات معًا. انشر الكود أولًا ثم طبّق الـ migration.

**لا تفعل أبدًا:** لا تُطبّق تغيير schema بلا migration. لا تُعِد إضافة `opening_balance_cents`.

---

## 7. كيف تُستخدم هذه القواعد

- **برومتات الذكاء الاصطناعي:** أضِف السطر «التزم بـ `docs/ACCOUNTING_RULES.md`». يجب أن يقرأه الوكيل قبل أي تعديل مالي.
- **مراجعة الكود:** أي PR يلمس المالية/الطلبات/التقارير/اللوحة يجب أن يذكر القواعد التي يحافظ عليها.
- **الفحص الدوري:** اضغط «فحص الآن» في صفحة التقارير بعد كل نشر، أو جدوله يوميًا.

---

## 8. التصنيف الرأسمالي والتشغيلي (المرحلة 2)

> **كل مصروف/شراء يُصنَّف بُعدين:** رأسمالي (نعم/لا) + طبيعة (ثابت/متغيّر).
> الافتراضي = تشغيلي-متغيّر. الربح التشغيلي يستثني الرأسمالي؛ الرأسمالي يظهر
> سطراً منفصلاً في الميزانية ويُخصم من حقوق الملكية للحفاظ على توازن IC-1.

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-18 | كل صف في `expense` و`purchase` يُصنَّف رأسمالياً (`is_capital_asset` boolean NOT NULL DEFAULT false) وطبيعياً (`cost_nature` text nullable ∈ {'fixed','variable'}). CHECK constraint على الجدولين يمنع القيم غير الصالحة: `is_capital_asset = true OR cost_nature IS NULL OR cost_nature IN ('fixed','variable')`. الافتراضي للصفوف القديمة = (false, NULL) ≡ «تشغيلي-متغيّر» ضمنياً، فلا تتغير الأرقام القائمة. CHECK constraint على الجدولين يمنع ترك الأبعاد في حالة غير منطقية. | مراجعة يدوية + CHECK في DB |
| INV-19 | **الرأسمالي لا يدخل الربح التشغيلي.** معادلة الربح التشغيلي الموحَّدة (LOCKED-6) عبر `computeOperatingPnl({startDate, endDate, tx})` من `src/features/finance/pnl.ts`: `operatingNetCents = salesCents − operatingExpensesCents − operatingPurchasesCents`، حيث المصاريف/المشتريات التشغيلية تستثني الرأسمالي عبر `COALESCE(is_capital_asset, false) = false`. `capitalAdditionsCents` = مصاريف رأسمالية + مشتريات رأسمالية، وتُعرض سطراً منفصلاً. **معادلة الميزانية المعدَّلة (Option A — للحفاظ على IC-1):** `retainedProfitCents = salesCashInCents − depositsLiability − operatingExpensesCents − operatingPurchasesCents` (ربح تشغيلي، يستثني الرأسمالي). `totalEquity = openingCash + injections − drawings + retainedProfitCents − capitalAdditionsCents` (سطر طرح منفصل للرأسمالي). المعادلة متوازنة: retained زاد بمقدار capitalOut (لم يعد مطروحاً) وtotalAssets لم يتغيّر (كان يطرح capitalOut أصلاً) → بطرح capitalAdditions من totalEquity نُلغي الزيادة فتبقى IC-1 = 0. | IC-6 المعدَّل + IC-13 |
| INV-19a | **تطابق الربح التشغيلي بين المصادر الثلاثة (LOCKED-6):** `dashboard.summary.netProfit` == `reports.pnl.netCents` == `dashboard.monthlyProfit[last].netProfitCents` لنفس الفترة، بالفِلْس. لا تعريف inline للربح مسموح — كلها تُنداء `computeOperatingPnl`. | IC-13 |

**قواعد إضافية للتعديلات المستقبلية في هذه المرحلة:**

**افعل:**
- قبل تعديل أي من `dashboard/queries.ts:getFinancialSummary`، `reports/actions.ts:computeCashBasisPnl`، `dashboard/queries.ts:getMonthlyProfit`، اقرأ INV-19 + INV-19a. كل تعريف inline للربح = خرق للقرار 6 من الـ spec.
- عند إضافة حقول تصنيف جديدة على `expense`/`purchase`، حدّث Zod schema + Drizzle field + Migration + CHECK constraint معاً في PR واحد.
- عند تعديل `getFinancialPosition`، تحقّق أن `equityDriftCents == 0` و`pnlReconciliationCents == 0` بعد التعديل. أي بند جديد يُضاف لطرفَي المعادلة.

**لا تفعل أبدًا:**
- لا تُعدّل تعريف الربح inline في dashboard أو reports أو monthly — استدعِ `computeOperatingPnl` فقط.
- لا تُسقط CHECK constraint على `is_capital_asset`/`cost_nature` — يحمي سلامة التصنيف.
- لا تُضمِن `totalCents` (عمود مُولَّد GENERATED ALWAYS) في أي `.values({...})` أو `.set({...})` على `purchase`. اكتب `unitCostMicroCents` و`quantity` فقط.
- لا تُسقط سطر `capitalAdditionsCents` من `totalEquity` في `getFinancialPosition` — IC-1 سينكسر بـ drift = 2 × capital.

---

## 9. دفتر المخزون (المرحلة 3 — تشغيلي، لا مالي)

> **`catalog_movement` هو دفتر مستقل لتسجيل الحركة الفيزيائية للمخزون.**
> منفصل تماماً عن `cash_movement`. لا يدخل P&L، لا الميزانية، لا حقوق الملكية.
> معلومة تشغيلية تساعد صاحب العمل على معرفة «كم عندي من كل صنف متتبَّع» قبل
> البيع، ولا تُغيّر أي رقم مالي.

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-19 | دفتر المخزون (`catalog_movement`) منفصل عن الدفتر النقدي (`cash_movement`). لا يدخل P&L، الميزانية، أو الـ equity. معلومة تشغيلية فقط. الأصناف غير المتتبَّعة (`tracked=false`) لا تُنشئ حركة مخزون إطلاقاً. | مراجعة يدوية + IC-12 (WARN) |
| INV-20 | خصم المخزون يحدث **فقط** في `convertOrderToSale` (لحظة التحويل، داخل نفس transaction إدراج المبيعة وحركات الصندوق). يُسترجَع في `reverseSale` (soft-delete للحركات الأصلية). كلاهما محميّ بـ `idempotencyKey` على مستوى الـ transaction. الـ atomicity مضمونة: فشل الخصم = rollback كامل (لا مبيعة، لا حركة نقدية، لا تغيير حالة). السالب مسموح (§6 سيناريو 1) — يُسجَّل في `notes` لكن لا يُمنع. | مراجعة يدوية + IC-12 (WARN) |
| IC-12 | **WATCH فقط، لا FAIL.** يعرض إجمالي حركات المخزون (`totalMovements` = Σ\|balance\|) والقيمة التقديرية للرصيد (`totalEstimatedValueCents` = Σ balance × defaultCostCents) للأصناف المتتبَّعة. القيمة تقديرية (defaultCostCents من الكتالوج، وليس سعر الشراء الفعلي). المخزون ليس قيد سلامة مالية — هذا الفحص معلومي بحت. | IC-12 |

**قواعد إضافية للتعديلات المستقبلية في هذه المرحلة:**

**افعل:**
- قبل تعديل `convertOrderToSale` أو `reverseSale`، اقرأ INV-20. أي خصم/استرجاع مخزون يجب أن يبقى داخل نفس الـ transaction، وأن يُستدعى قبل تحديث `order.status`.
- عند تعديل `createPurchase`/`updatePurchase`، احرص على مزامنة `catalog_movement` (`source_type='purchase'`) داخل نفس الـ transaction. `updatePurchase` يحذف ناعماً الحركة القديمة قبل إدراج الجديدة (نمط re-derive).
- عند تعديل `updateOrder` للطلبات المُسلَّمة، امنع تعديل المكوّنات (لأن الكميات المُخصومة في `catalog_movement` تعتمد على لقطة المكوّنات وقت التسليم). الرسالة: «استخدم reverseSale أولاً ثم عدّل ثم أعد التحويل».
- عند إضافة `source_type` جديد على `catalog_movement`، حدّث CHECK constraint في `db.ts` و migration + Zod + IC-12 معاً.
- جميع حركات المخزون تُسجّل بـ `quantity > 0` (CHECK constraint). السالب يُمثَّل بـ `direction='out'`، لا بكمية سالبة.

**لا تفعل أبداً:**
- لا تُضمِّن قيمة `catalog_movement.balance` في أي حساب مالي: لا `retainedProfitCents`، لا `totalAssets`، لا `totalEquity`، لا `computeOperatingPnl`. المخزون تشغيلي بحت.
- لا تُنشئ حركة `cash_movement` مرتبطة بحركة `catalog_movement`. الدفتران منفصلان تماماً (INV-19). الشراء يُدرج حركة صندوق `out` (مالية) + حركة مخزون `in` (تشغيلية) — كلٌّ في دفتره.
- لا تمنع السالب في `deductForDelivery` (§6 سيناريو 1). التحويل يكتمل، يُخصم الرصيد، ويُسجَّل التحذير في `notes`. الـ transaction لا تفشل بسبب السالب.
- لا تُعدّل `linked_catalog_component_id` على `purchase` دون مزامنة `catalog_movement`. الحركة القديمة تُحذف ناعماً والجديدة تُدرج في نفس الـ transaction.
- لا تُفعِّل `tracked=true` على صنف له رصيد > 0 دون تأكيد المستخدم صراحةً (§6 سيناريو 4 / SA1 NOTE-3). UI يجب أن يُظهر تحذيراً قبل الإلغاء.
- لا تُسقط الـ trigger `set_updated_at` على `catalog_movement` (مُرفَق في migration 0020). الحفاظ على `updated_at` تلقائياً يتسق مع باقي الجداول.

---

## 10. الإهلاك (placeholder — المرحلة 4)

> placeholder. سيُملأها SUB-AGENT 4 (Depreciation) في بطاقة 4.G بعد إكمال Phase 4.
> يحتاج قرار المالك صراحةً قبل البدء (انظر بطاقة 4.A من الـ spec).
