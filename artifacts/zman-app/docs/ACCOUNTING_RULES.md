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

**استثناء مقصود للأصناف المتتبَّعة (Phase 3-revised):** الشراء لصنف متتبَّع
(`catalog_component.tracked = true`) يُرأسمَل كمخزون (لا يخفض الربح التشغيلي
في شهر الشراء)؛ التكلفة تُخصَم عند البيع عبر تعديل غير نقدي محسوب عند القراءة
(مثل الإهلاك في §10). هذا **لا يكسر** الأساس النقدي للصندوق — النقد خرج فعلاً
عند الشراء وحُسب في الـ cash_movement، والمخزون يظهر كأصل في الميزانية بجانب
النقد. بل يُحسِّن مطابقة الإيراد بالتكلفة: تُخصَم تكلفة البضاعة المباعة (COGS)
من الربح في نفس شهر البيع، لا في شهر الشراء. الأصناف غير المتتبَّعة
(`tracked = false`) تبقى تشغيلية بحتة كما في INV-1 الأصلي. موثَّق في §9 (INV-23 /
INV-24). معادلة IC-1 (totalAssets = totalLiab + totalEquity) تبقى متوازنة جبرياً:
الشراء المُرأسمَل ينقل مبلغاً من Cash إلى Inventory (الأصول ثابتة)، والبيع
يزيد Cash بـ saleCents ويُخصم COGS من retainedProfitCents ويُقلِّل Inventory
بنفس المقدار — فتبقى المعادلة متوازنة (راجع التطبيق العملي في §9).

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

## 9. دفتر المخزون (المرحلة 3-revised — تشغيلي للأصناف غير المتتبَّعة، مُرأسمَل للمتتبَّعة)

> **`catalog_movement` هو دفتر مستقل لتسجيل الحركة الفيزيائية للمخزون (in/out).**
> منفصل تماماً عن `cash_movement`. سلوكه يعتمد على نوع الصنف:
>
> - **الأصناف غير المتتبَّعة** (`tracked = false`): لا تُنشئ حركة مخزون إطلاقاً
>   (الشراء يبقى تشغيلياً بحتاً، يخفض الربح في شهر الشراء — INV-1 الأصلي).
> - **الأصناف المتتبَّعة** (`tracked = true`): الشراء يُرأسمَل كمخزون (لا يخفض
>   الربح التشغيلي)، والتكلفة تُخصَم عند البيع عبر COGS (تعديل غير نقدي محسوب
>   عند القراءة، مثل الإهلاك). هذا الاستثناء مقصود لمطابقة الإيراد بالتكلفة،
>   ويُحاكي أنموذج Phase 4 (INV-22). موثَّق في INV-23 / INV-24.

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-20 | دفتر المخزون (`catalog_movement`) منفصل عن الدفتر النقدي (`cash_movement`) — لا حركة `cash_movement` مرتبطة بحركة `catalog_movement`. كلٌّ في دفتره. الأصناف غير المتتبَّعة (`tracked=false`) لا تُنشئ حركة مخزون إطلاقاً (الشراء تشغيلي بحت). الأصناف المتتبَّعة (`tracked=true`) تُنشئ حركة `in` عند الشراء و`out` عند التحويل لبيع. | مراجعة يدوية + IC-12 |
| INV-21 | خصم المخزون يحدث **فقط** في `convertOrderToSale` (لحظة التحويل، داخل نفس transaction إدراج المبيعة وحركات الصندوق). يُسترجَع في `reverseSale` (soft-delete للحركات الأصلية). كلاهما محميّ بـ `idempotencyKey` على مستوى الـ transaction. الـ atomicity مضمونة: فشل الخصم = rollback كامل (لا مبيعة، لا حركة نقدية، لا تغيير حالة). السالب مسموح (§6 سيناريو 1) — يُسجَّل في `notes` لكن لا يُمنع. | مراجعة يدوية + IC-12 |
| INV-23 | **رأسمَلة المخزون المتتبَّع (Phase 3-revised / D4 fix).** الشراء لصنف متتبَّع (`purchase.is_tracked_inventory = true`) يُستبعَد من `operatingPurchasesCents` في `computeOperatingPnl` (لا يخفض الربح التشغيلي في شهر الشراء). يُرأسمَل كمخزون بالتكلفة التاريخية (`floor(totalCents / quantity)` للوحدة، يُخزَّن في `catalog_movement.unit_cost_cents` للحركة `in`). حركة الصندوق `out` تُدرَج كالمعتاد (النقد خرج فعلاً)، لكنها تُوسم بـ `is_tracked_inventory = true` ليُستبعَد مبلغها من P&L. `createPurchase`/`updatePurchase` يضبطان `is_tracked_inventory` تلقائياً عند `linked_catalog_component_id` يشير لصنف متتبَّع. الأصناف غير المتتبَّعة تبقى تشغيلية بحتة (`is_tracked_inventory = false`). | مراجعة يدوية + IC-12 (PASS/WARN/FAIL) + IC-13 |
| INV-24 | **COGS عند البيع (Phase 3-revised / D4 fix).** عند `convertOrderToSale`، يُحسَب التكلفة الوسطية المرجَّحة للوحدة من `catalog_movement in` النشطة: `Σ(in_qty × coalesce(unit_cost_cents, 0)) / Σ(in_qty)`. تُخزَّن على الحركة `out` (`unit_cost_cents`) لتكون COGS غير قابلة للتعديل لاحقاً (immutable). `computeOperatingPnl` يخصم `cogsCents = Σ(out_qty × unit_cost_cents)` للفترة من `operatingNetCents` كتعديل غير نقدي (مثل الإهلاك — لا حركة `cash_movement`). `getFinancialPosition` يخصم `cogsCentsToDate` من `retainedProfitCents` ويُضيف `inventoryValueCents = Σ(in_qty × unit_cost) − Σ(out_qty × unit_cost)` إلى `totalAssets` (Cash + Inventory) — IC-1 يبقى 0 جبرياً. `reverseSale` يُعاكَس بـ soft-delete للحركة `out` (COGS يُعاكَس تلقائياً عند القراءة — لا حاجة لكتابة إضافية). | مراجعة يدوية + IC-12 (PASS/WARN/FAIL) + IC-13 |
| IC-12 | **PASS/WARN/FAIL حقيقي (D5 fix).** FAIL عند وجود صفوف catalog_movement يتيمة (order_component_id يشير لصف order_component غير موجود). WARN عند وجود صنف متتبَّع برصيد سالب (§9 سيناريو 1 — مسموح لكن يستحق الإشارة). PASS خلاف ذلك (بما في ذلك عدم وجود أصناف متتبَّعة). يعرض القيمة الدفترية الفعلية للمخزون (`inventoryValueCents = Σ(in_qty × unit_cost) − Σ(out_qty × unit_cost)` من `catalog_movement`، وليست تقدير `defaultCostCents × balance` كما كانت قبل D4). المخزون المتتبَّع الآن جزء فعلي من `totalAssets` وIC-1. | IC-12 |

**قواعد إضافية للتعديلات المستقبلية في هذه المرحلة:**

**افعل:**
- قبل تعديل `convertOrderToSale` أو `reverseSale`، اقرأ INV-21 + INV-24. أي خصم/استرجاع مخزون يجب أن يبقى داخل نفس الـ transaction، وأن يُستدعى قبل تحديث `order.status`. وللأصناف المتتبَّعة، تأكّد أن `unit_cost_cents` يُحسَب ويُخزَّن على الحركة `out` (COGS غير قابل للتعديل).
- عند تعديل `createPurchase`/`updatePurchase`، احرص على مزامنة `catalog_movement` (`source_type='purchase'`) داخل نفس الـ transaction، وعلى ضبط `is_tracked_inventory` تلقائياً بناءً على `tracked` للصنف المرتبط. `updatePurchase` يحذف ناعماً الحركة القديمة قبل إدراج الجديدة (نمط re-derive).
- عند تعديل `computeOperatingPnl` أو `getFinancialPosition`، احرص على معالجة COGS كتعديل غير نقدي (لا حركة `cash_movement`)، وعلى بقاء IC-1 = 0 (راجع المعادلة في INV-24).
- عند تعديل `updateOrder` للطلبات المُسلَّمة، امنع تعديل المكوّنات (لأن الكميات المُخصومة في `catalog_movement` تعتمد على لقطة المكوّنات وقت التسليم). الرسالة: «استخدم reverseSale أولاً ثم عدّل ثم أعد التحويل». **D6 fix (SA3):** لا تُنفِّذ DELETE+re-INSERT على `order_component` إلا إذا تغيّرت المكوّنات فعلاً — هذا يحمي FK على `catalog_movement.order_component_id` من اليتم.
- عند إضافة `source_type` جديد على `catalog_movement`، حدّث CHECK constraint في `db.ts` و migration + Zod + IC-12 معاً.
- جميع حركات المخزون تُسجّل بـ `quantity > 0` (CHECK constraint). السالب يُمثَّل بـ `direction='out'`، لا بكمية سالبة.

**لا تفعل أبداً:**
- لا تُضمِّن قيمة `catalog_movement.balance` في أي حساب مالي **للأصناف غير المتتبَّعة** — المخزون التشغيلي لا يؤثر على الأرقام المالية. (الاستثناء: الأصناف المتتبَّعة المُرأسمَلة عبر INV-23 / INV-24 — راجع `inventoryValueCents` و`cogsCents`.)
- لا تُنشئ حركة `cash_movement` مرتبطة بحركة `catalog_movement`. الدفتران منفصلان تماماً (INV-20). الشراء يُدرج حركة صندوق `out` (مالية) + حركة مخزون `in` (تشغيلية) — كلٌّ في دفتره.
- لا تمنع السالب في `deductForDelivery` (§6 سيناريو 1). التحويل يكتمل، يُخصم الرصيد، ويُسجَّل التحذير في `notes`. الـ transaction لا تفشل بسبب السالب.
- لا تُعدّل `linked_catalog_component_id` على `purchase` دون مزامنة `catalog_movement` وضبط `is_tracked_inventory`. الحركة القديمة تُحذف ناعماً والجديدة تُدرج في نفس الـ transaction.
- لا تُفعِّل `tracked=true` على صنف له رصيد > 0 دون تأكيد المستخدم صراحةً (§6 سيناريو 4 / SA1 NOTE-3). UI يجب أن يُظهر تحذيراً قبل الإلغاء.
- لا تُسقط الـ trigger `set_updated_at` على `catalog_movement` (مُرفَق في migration 0020). الحفاظ على `updated_at` تلقائياً يتسق مع باقي الجداول.
- لا تُسقط FK على `catalog_movement.order_component_id` (مُضاف في migration 0023 كجزء من D6 fix). الـ FK يحمي من إعادة إنشاء `order_component` بطريقة تُيتم الحركات المرتبطة.
- لا تُخصَم COGS مرتين: مرة في `computeOperatingPnl.cogsCents` ومرة في `getFinancialPosition.retainedProfitCents`. الأولى يُخصَم من `operatingNetCents` (للعرض)، والثانية يُخصَم من `retainedProfitCents` (للميزانية). الفرق بينهما = 0 (كلاهما يطرح نفس المبلغ، فلا ازدواج).

### مثال تطبيقي: شراء 100 وحدة @ 10 د.أ، بيع 50 وحدة @ 20 د.أ

> هذا المثال يُوضِّح INV-23 / INV-24. الأسعار بالـ fils (10 د.أ = 10,000 fils).

| المرحلة | الحدث | Cash | Inventory | P&L | Equity | IC-1 |
|---|---|---|---|---|---|---|
| 1 | شراء 100 وحدة @ 10,000 fils (إجمالي 1,000,000 fils) | −1,000,000 | +1,000,000 | 0 (شراء مُرأسمَل، لا يخفض الربح) | 0 (Cash ↓1M، Inventory ↑1M، المجموع ثابت) | ✓ |
| 2 | بيع 50 وحدة @ 20,000 fils (إيراد 1,000,000 fils، COGS 50×10,000 = 500,000 fils) | +1,000,000 | −500,000 (50 × 10,000) | +500,000 (1,000,000 saleCents − 500,000 COGS) | +500,000 (retained يزيد بـ 500,000) | ✓ |
| 3 | بعد العمليتين | 0 (−1M + 1M) | +500,000 (50 وحدة متبقية × 10,000) | +500,000 | +500,000 | ✓ (totalAssets 500,000 = totalEquity 500,000 + totalLiab 0) |

**التحقق من IC-1 بعد المرحلة 2:**
- `totalAssets` = Cash + Inventory = 0 + 500,000 = 500,000 fils.
- `totalLiabilities` = 0 (لا عربونات نشطة).
- `retainedProfitCents` = salesCashInCents (1,000,000) − deposits (0) − operatingExpenses (0) − operatingPurchases (0، الشراء المُرأسمَل مُستبعَد) − cogsCentsToDate (500,000) = 500,000 fils.
- `totalEquity` = opening (0) + injections (0) − drawings (0) + retained (500,000) − capitalAdditions (0) = 500,000 fils.
- `equityDriftCents` = totalAssets − totalLiab − totalEquity = 500,000 − 0 − 500,000 = **0** ✓.

**التحقق من LOCKED-6 (IC-13) بعد المرحلة 2:** كل من `dashboard.summary.netProfit`،
`reports.pnl.netCents`، و`dashboard.monthlyProfit` تُنداء `computeOperatingPnl` التي
تُرجِع `operatingNetCents = salesCents (1,000,000) − operatingExpensesCents (0) −
operatingPurchasesCents (0، الشراء المُرأسمَل مُستبعَد) − cogsCents (500,000) −
monthlyDepreciationCents (0) = 500,000 fils`. التطابق مضمون بالبناء (LOCKED-6 محفوظ).

---

## 10. الإهلاك (المرحلة 4 — خيار γ: محسوب عند القراءة، غير نقدي)

> **`capital_asset` جدول مستقل للأصول الرأسمالية المُهلَكة.** لا يدخل
> `cash_movement` إطلاقاً — الإهلاك تعديل محسوب يُخصَم من الربح التشغيلي فقط
> (لمطابقة مفهوم «تكلفة الأصل» بذهن صاحب العمل). يُحسَب عند كل قراءة من
> `computeOperatingPnl` و`IC-14` — لا CRON، لا جدول شهري. القرار 7 من
> الـ spec (الخيار γ) مع تعديل صريح لـ INV-1.

### التعارض الدستوري المُحلول

INV-1 ينصّ على أن «`cash_movement` هو المصدر الوحيد للحقيقة لكل النقد». خيار γ
يُضيف الإهلاك كـ**تعديل غير نقدي** يُخصَم من الربح التشغيلي. هذا **لا يكسر**
INV-1 من حيث المبدأ (الإهلاك ليس حركة نقدية، فلا يدخل cash_movement)، لكنه
يُعدِّل تفسير «الربح التشغيلي» ليشمل بنداً غير نقدي. INV-22 يوثِّق هذا التعديل
صراحةً كاستثناء مقصود.

| # | القاعدة | يفرضها الفحص |
|---|---|---|
| INV-22 | **الإهلاك شهري محسوب، ليس حركة نقدية.** لا يُدرَج أي صف في `cash_movement` للإهلاك. يُحسَب عند كل قراءة من `capital_asset` عبر `(EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age))` بدل `date_part('month', age)` (الذي يُرجِع 0-11 فقط، خاطئ للأصول فوق 12 شهراً — راجع SA1 CRITICAL-NOTE-4). النتيجة تُخصَم من `operatingNetCents` في `computeOperatingPnl`. `started_at = now()` (تاريخ بداية الإهلاك = لحظة قرار المستخدم، لا تاريخ الشراء الأصلي — يمنع الإهلاك بأثر رجعي). الإهلاك يبدأ من شهر `started_at` نفسه ويستمر `useful_life_months` شهراً (months_elapsed من 0 إلى life−1). لا يدخل الميزانية (`getFinancialPosition` لا يستعمل `operatingNetCents` — يبني `retainedProfitCents` محلياً من `operatingExpensesCents + operatingPurchasesCents` cash-basis). الفرق بين `dashboard.netProfit` (يضم الإهلاك) و`retainedProfitCents` (لا يضمه) = `monthlyDepreciationCents`. هذا فصل مقصود بين «الربح التشغيلي المُعدَّل» (للعرض الإداري) و«الربح التشغيلي النقدي» (للميزانية). | IC-14 (PASS/WARN/FAIL) |
| IC-14 | **PASS/WARN/FAIL حقيقي (D5 fix).** FAIL عند وجود أصول يتيمة (capital_asset نشط ومصدره expense/purchase محذوف/غير موجود — يُكشَف عبر LEFT JOIN على expense/purchase في `getCapitalAssetValuation`). WARN عند وجود أصول مُستهلَكة بالكامل (months_elapsed >= useful_life_months — معلومة لا خطأ). PASS خلاف ذلك (بما في ذلك عدم وجود أصول). يعرض: (1) `totalOriginalCents` = SUM(purchase_amount_cents) حيث started_at <= asOfDate، (2) `totalDepreciatedToDateCents` = SUM(depreciationForAsset) حيث depreciationForAsset = purchase_amount إن months_elapsed >= useful_life (قاعدة «الشهر الأخير يُكلِّف الباقي» — D13 fix لتفادي residual صغير من floor) وإلا months_elapsed × monthly_dep، (3) `netBookValueCents` = الفرق (يصل لـ 0 بالضبط عند انقضاء العمر النافع). activeCount مُقيَّد بالأصول قيد الإهلاك فعلاً (D13 fix). | IC-14 |

**قواعد إضافية للتعديلات المستقبلية في هذه المرحلة:**

**افعل:**
- قبل تعديل `computeOperatingPnl`، اقرأ INV-22. أي تعديل للإهلاك يجب أن يبقى
  محسوباً عند القراءة (لا تخزين شهري)، وأن يستعمل صيغة EXTRACT الصحيحة
  لـ months_elapsed (لا `date_part`).
- عند تعديل `getCapitalAssetValuation` في `depreciation/queries.ts`، تحقّق أن
  الـ CASE WHEN يحدّ من months_elapsed عند useful_life_months (الأصول
  المُستهلَكة بالكامل لا تُساهم بأكثر من useful_life_months × monthly_dep).
- عند تعديل `DepreciationPromptModal`، احرص على أن usefulLifeMonths بين 1 و
  600 (50 سنة) — الحد الأقصى منطقي للأصول طويلة العمر.
- عند تعديل `addCapitalAsset`، تحقّق من idempotency على مستوى المصدر: إن
  وُجد capital_asset نشط مسبقاً لنفس (source_type, source_id)، أرجِع الصف
  الموجود (لا تُنشئ صفّاً ثانياً).

**لا تفعل أبداً:**
- لا تُدرِج أي حركة في `cash_movement` للإهلاك. الإهلاك **غير نقدي** إطلاقاً —
  INV-22 (استثناء صريح لـ INV-1).
- لا تستعمل `date_part('month', age(...))` لحساب months_elapsed — يُرجِع 0-11
  فقط، فيستمر الإهلاك خطأً بعد انقضاء العمر النافع. استعمل دائماً
  `(EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age))`.
- لا تُفعِّل الإهلاك تلقائياً عند حفظ صف رأسمالي — يجب أن يطلبه المستخدم
  صراحةً عبر toggle «تصنيف متقدّم» ثم اختيار «توزيع شهري». السلوك الافتراضي
  هو «خصم مرة واحدة» (Phase 2 — إضافات رأسمالية).
- لا تُعدِّل `getFinancialPosition.retainedProfitCents` ليخصم الإهلاك. الميزانية
  تبقى cash-basis صرفة. الإهلاك تعديل تشغيلي فقط.
- لا تُسقِط CHECK constraint على `capital_asset_useful_life_positive` (يفترض
  useful_life_months > 0).
- لا تُسقِط CHECK constraint على `capital_asset_source_type_enum` (يفترض
  source_type ∈ {'expense', 'purchase'}).
- لا تُسقِط الـ trigger `set_updated_at` على `capital_asset` (مُرفَق في migration
  0022). الحفاظ على `updated_at` تلقائياً يتسق مع باقي الجداول.

### مثال تحقق (من بطاقة 4.D في الـ spec)

أصل رأسمالي 1200 د.أ (1,200,000 فلس)، عمر نافع 12 شهراً → monthly_dep =
floor(1,200,000 / 12) = 100,000 فلس (100 د.أ/شهر).

- بعد 6 أشهر من `started_at`:
  - `monthlyDepreciationCents` في P&L = 100,000 فلس (100 د.أ — حصّة الشهر الحالي
    ما دام months_elapsed < 12).
  - `totalDepreciatedToDateCents` في IC-14 = 6 × 100,000 = 600,000 فلس (600 د.أ).
  - `netBookValueCents` = 1,200,000 − 600,000 = 600,000 فلس (600 د.أ).
- بعد 12 شهراً: months_elapsed = 12 = useful_life_months → الإهلاك توقّف.
  - `monthlyDepreciationCents` في P&L = 0 (لا يُخصَم بعد الآن).
  - `totalDepreciatedToDateCents` = 12 × 100,000 = 1,200,000 فلس (1,200 د.أ).
  - `netBookValueCents` = 0 (الأصل مُستهلَك بالكامل).
- بعد 18 شهراً (اختبار CRITICAL-NOTE-4):
  - `date_part('month', age)` = 6 (خطأ — كان سيُستمرّ الإهلاك خطأً).
  - `(EXTRACT(YEAR FROM age) * 12 + EXTRACT(MONTH FROM age))` = 18 (صحيح).
  - 18 > 12 → الإهلاك متوقّف، `monthlyDepreciationCents` = 0. ✓

### مثال period-scaling (D2 fix — إهلاك الفترة)

> قبل إصلاح D2، كانت `computeOperatingPnl` تستدعي `getActiveMonthlyDepreciationCents(endDate)`
> التي تُعيد `SUM(monthly_dep)` لكل الأصول النشطة — **حصة شهر واحد** بغضّ النظر
> عن طول الفترة. فترة «كل التاريخ» كانت تطرح شهراً واحداً فقط من إهلاك أصل عمره
> 10 أشهر. بعد D2 fix، تستدعي `computeOperatingPnl` الدالة الجديدة
> `getDepreciationForPeriodCents({ startDate, endDate })` التي تُعيد إهلاك الفترة
> المُتراكِم. IC-13 يفحص التطابق في فترتين الآن (شهر حالي + كل التاريخ) لكشف
> أي خطأ period-scaling مستقبلاً.

نفس الأصل أعلاه (1,200,000 فلس، 12 شهراً، monthly_dep = 100,000) بدأ قبل 10 أشهر
من اليوم. monthly_dep = 100,000 فلس. months_elapsed عند اليوم = 10 (< 12 → ما زال
نشطاً). effectiveStart لكل فترة = max(startedAt, startDate).

| نطاق الفترة | startDate | endDate | monthsAtEnd | monthsAtStart | الإهلاك المخصوم من `operatingNetCents` |
|---|---|---|---|---|---|
| `range: "all"` (P&L الافتراضي) | null | اليوم | min(10, 12) = 10 | 0 (startDate = null) | **10 × 100,000 = 1,000,000 فلس** (1,000 د.أ) |
| نافذة 30 يوماً (الشهر الحالي) | قبل ~30 يوماً | اليوم | 10 | 9 | 1 × 100,000 = **100,000 فلس** (100 د.أ) |
| نافذة شهرين | قبل شهرين | اليوم | 10 | 8 | 2 × 100,000 = **200,000 فلس** (200 د.أ) |
| نافذة 6 أشهر (لو الأصل بدأ قبل 10) | قبل 6 أشهر | اليوم | 10 | 4 | 6 × 100,000 = **600,000 فلس** (600 د.أ) |
| نافذة تبدأ قبل `started_at` | قبل 20 شهراً | اليوم | 10 | 0 (effectiveStart = startedAt) | 10 × 100,000 = **1,000,000 فلس** (1,000 د.أ — لا إهلاك بأثر رجعي قبل البدء) |
| نافذة بعد انقضاء العمر | قبل 14 شهراً | بعد 13 شهراً من startedAt | 13 → min(13,12)=12 | 14 → min(14,12)=12 | (12 − 12) × 100,000 = **0 فلس** (مُستهلَك بالكامل قبل بداية الفترة) |

ملاحظات:
- `range: "all"` يمرِّر `startDate = null` لـ `computeOperatingPnl`، فتعامِل
  `getDepreciationForPeriodCents` كل أصل كأن `monthsAtStart = 0` → النتيجة
  تراكمية منذ `started_at` حتى `endDate`. هذا ما يحتاجه P&L لكامل الفترة.
- للأصل الذي يبدأ **خلال** الفترة (مثلاً بدأ في اليوم 15 من شهر ذو 30 يوماً)،
  الفترة = ذلك الشهر → `monthsAtEnd = 0` و`monthsAtStart = 0` (effectiveStart =
  startedAt) → الإهلاك = 0 لذلك الشهر الجزئي. الشهر التالي يحسب 1 × monthly_dep.
  هذا اختلاف مقصود عن السلوك القديم الذي كان يطرح monthly_dep كاملة للشهر
  الجزئي. موثَّق في `getDepreciationForPeriodCents`.
- IC-13 يفحص التطابق في فترتين (شهر حالي + كل التاريخ). الانحراف في الفترة (B)
  دون (A) = علامة قوية على خطأ period-scaling في الإهلاك.

### قاعدة تسمية البطاقات في الـ UI (D3 fix)

> **أي رقم في الـ UI على شكل «ربح» يجب أن يُصرِّح بأي تعريفَي الربح هو.**
> التعريفان المعتمدان:
>
> 1. **الربح التشغيلي (بعد الإهلاك)** — يضم الإهلاك المحسوب غير النقدي للفترة.
>    مصدره: `computeOperatingPnl.operatingNetCents` عبر إحدى نقاط الدخول الثلاث
>    الموحَّدة (LOCKED-6: `dashboard.summary.netProfit`، `reports.pnl.netCents`،
>    `dashboard.monthlyProfit`). يُعرض في بطاقة «الربح التشغيلي» على الـ dashboard
>    وفي تقرير P&L.
>
> 2. **الربح النقدي المحتجز (قبل الإهلاك)** — لا يشمل الإهلاك (لأنه غير نقدي).
>    مصدره: `getFinancialPosition.equity.retainedProfitCents` (يُبنى محلياً من
>    `operatingExpensesCents + operatingPurchasesCents` cash-basis). يُعرض في
>    بطاقة «الربح مقابل السيولة» على الـ dashboard وفي الميزانية.
>
> الفرق بين التعريفين = إهلاك الفترة (`monthlyDepreciationCents` من
> `computeOperatingPnl`). هذا الفرق مُعرض على الـ dashboard كبطاقة مستقلة
> «إهلاك الفترة (غير نقدي)» بين البطاقتين، ليتمكّن المالك من رؤية المصالحة.
>
> **لا تُضِف رقم ربح ثالث** بدون تصريح صريح بأي تعريف هو. أي بطاقة ربح جديدة
> يجب أن تحمل التسمية الكاملة (بعد/قبل الإهلاك) وأيقونة `InfoTooltip` تشرح
> الفرق. هذا يمنع تكرار خلل D3 (رقمان مختلفان على نفس اللوحة يُقرآن كمنافسين
> على نفس السؤال «هل أربح؟»).

