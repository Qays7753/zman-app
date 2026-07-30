# تقرير إصلاحات ZMAN — جولة الإصلاحات السريعة والهيكلية

**التاريخ:** جولة الإصلاحات السريعة (Quick Wins & Structural Fixes)
**المستودع:** `/home/z/my-project/zman-app`
**التطبيق:** Next.js 15.5 PWA على المسار `artifacts/zman-app`
**الفرع:** `main` (نقطة الانطلاق: الالتزام `f49b6a8`)
**الفريق:** 5 وكلاء (مهندس + 3 منفِّذين + QA/مراجِع/مُقرِّر)

---

## ملخّص تنفيذي

أُنجِزَت في هذه الجولة سبعة إصلاحات لتجربة المستخدم والهيكل، تمتدّ من فخّ التعديل
في النماذج المالية، إلى زرّ الإضافة العائم في شاشة المخزون، إلى إعادة تسمية التبويبات
والفلتر الافتراضي للوقت، إلى جعل البطاقة الصحّية قابلة للنقر، إلى إطالة مدّة قفل
الخمول، إلى نقل زرّ «إدارة الفئات» من قائمة «المزيد» إلى رأس تبويب المصاريف.

تولّى الوكلاء 2 و3 و4 التنفيذ، وأخذ الوكيل 5 (هذا التقرير) على عاتقه مراجعة كل
التغييرات، وإجراء فحص الجودة (TypeScript + Next.js build)، وإصلاح خطأ نوعيّ كان
قد تركه الوكيل 4 كـ TODO في خطّاف `useCreateCatalogComponent`، ثم إعادة بناء
التطبيق بنجاح. لم تُلمَس أيّ شيفرة محاسبية أو استعلامات قاعدة بيانات أو مخطّطات
Drizzle. ولم يُدفع أيّ تغيير إلى GitHub.

النتيجة: ٧ من ٧ إصلاحات مُتحقَّق منها، typecheck أخضر، Next.js build أخضر، وكلّ
القيود الستّة محترَمة.

---

## جدول الإصلاحات

| # | المشكلة | الحلّ | الملفّات المعدَّلة |
|---|---------|------|---------------------|
| 1 | فخّ التعديل (Edit Trap): زرّ التعديل كان يفتح النموذج القديم `ExpenseForm`/`PurchaseForm` بدلاً من `SmartFinanceForm` | أُضيف prop اختياري `initialData?: SmartFinanceFormInitialData` إلى `SmartFinanceForm` مع تفرُّع كامل في معالجات الإرسال الثلاثة (مصروف/شراء/أصل) لاستدعاء `useUpdateExpense`/`useUpdatePurchase` في وضع التعديل. أُستُبدِل `<ExpenseForm>` و`<PurchaseForm>` في مودال التعديل بـ`<SmartFinanceForm initialData={...} />` + زرّ حذف مستقلّ | `SmartFinanceForm.tsx`, `ExpensesTab.tsx`, `PurchasesTab.tsx` |
| 2 | شاشة المخزون بلا زرّ إضافة عائم (FAB) لإضافة صنف متتبَّع أو تعديل سريع للرصيد | أُضيف `<FloatingActionButton>` يفتح مودال قائمة إجراءات بثلاثة خيارات: «إضافة صنف مُتابَع» (يفتح `AddTrackedItemForm`)، «تعديل سريع للمخزون» (يفتح `QuickAdjustStockForm`)، و«إدارة الكتالوج الكامل» (رابط إلى `/catalog`) | `InventoryScreen.tsx` (معدَّل) + `components/AddTrackedItemForm.tsx` + `components/QuickAdjustStockForm.tsx` (جديدان) |
| 3 | التبويب الافتراضي كان «المشتريات» وأسماء التبويبات بصيغة غير الشخصية (`المصاريف`/`المشتريات`/`المبيعات`) | تَغيَّر التبويب الافتراضي إلى `"sales"`، وأُعيدت تسمية التبويبات إلى `مصاريفي`/`مشترياتي`/`مبيعاتي` (دون استخدام الكلمة المحظورة «خاماتي») | `FinanceClient.tsx` |
| 4 | الفلتر الافتراضي للوقت كان يُسمّى «الكل» (لفظ غير دالّ على المدى الزمني) | أُعيدت تسمية `presets[0].label` من `"الكل"` إلى `"منذ البداية"`. الإعداد الافتراضي `useState(0)` كان يُشير أصلاً إلى index 0 (كل الفترات) فلم يُلزَم تغييره | `DashboardClient.tsx` |
| 5 | صفّا «قيمة مخزونك» و«عربون مستحق التسليم» في البطاقة الصحّية كانا نصّاً ميتاً غير قابل للنقر | غُلِّفَ كامل صفّ `<div>` بـ`<Link href="/inventory">` و`<Link href="/orders">` على التوالي، مع classes تظليل عند المرور (`hover:bg-*` + `hover:underline cursor-pointer`) | `DashboardClient.tsx` |
| 6 | قفل الخمول كان يُقفل التطبيق بعد دقيقتين فقط (قصير جداً للورش) | تَغيَّر `IDLE_LIMIT_MS` من `2 * 60 * 1000` إلى `10 * 60 * 1000` (10 دقائق) مع تحديث التعليق وJSDoc | `IdleLock.tsx` |
| 7 | زرّ «إدارة الفئات» كان مختبئاً في قائمة «المزيد» بدلاً من ظهوره في رأس تبويب المصاريف | أُضيف زرّ `<Button variant="secondary">إدارة الفئات</Button>` في أعلى محتوى تبويب المصاريف يفتح `FinanceCatalogModal` عبر محدِّد URL `manageCatalog=expenses`. حُذِف الإدخال المقابل من `moreNavItems` في `nav.ts` | `ExpensesTab.tsx`, `nav.ts` |

---

## تفاصيل كل إصلاح

### الإصلاح #1: فخّ التعديل (Edit Trap)

**المشكلة:** عند الضغط على زرّ التعديل في عنصر مصروف أو مشتريات، كان التطبيق يفتح
النموذج القديم `ExpenseForm`/`PurchaseForm` بدلاً من `SmartFinanceForm` الموحَّد،
ممّا يُوقع المستخدم في تجربة منقسمة (Create في نموذج ذكيّ، Edit في نموذج قديم).

**الحلّ المُطبَّق:**
- صُدِّرَت واجهة جديدة `SmartFinanceFormInitialData` (حقول مُسطَّحة تغطي الأنواع
  الثلاثة: مصروف/شراء/أصل) في `SmartFinanceForm.tsx`.
- أُضيف prop اختياري `initialData?: SmartFinanceFormInitialData` إلى المكوّن.
- يُشتَقّ الوضع الابتدائي (`mode`) من `initialData?.type`، وعَلَم `isEditing` من
  وجود `initialData?.id`.
- تُشتَقّ `defaultValues` لكلّ نموذج RHF (مصروف/شراء/أصل) من `initialData` عبر
  `useMemo`، فيُفتح النموذج مُعبَّئاً مسبقاً عند التعديل.
- كلّ معالج إرسال (`handleExpenseSubmit`/`handlePurchaseSubmit`/`handleAssetSubmit`)
  يتفرَّع على `isEditing`: في وضع التعديل يستدعي `updateExpense.mutateAsync` أو
  `updatePurchase.mutateAsync` (مع الحفاظ على `isCapitalAsset` و`costNature`
  الأصليَّين لأن نموذج المصروف/الشراء لا يُعرِضهما)، وفي وضع الإنشاء يبقى المسار
  الأصليّ دون تغيير.
- زرّ الإرسال يُغيِّر لاحقته: `"حفظ التعديلات"` في وضع التعديل، `"تسجيل المصروف"/"تسجيل الشراء"/"تسجيل الأصل"` في وضع الإنشاء.
- في `ExpensesTab.tsx` و`PurchasesTab.tsx`، استُبدِل `<ExpenseForm>` و
  `<PurchaseForm>` في مودال التعديل بـ`<SmartFinanceForm initialData={...} />`
  داخل `<div className="space-y-3">` يضمّ أسفله زرّ `<Button variant="destructive">حذف</Button>`
  (لأنّ `SmartFinanceForm` لا يُدير الحذف — يبقى من مسؤوليّة الأب عبر `ConfirmDialog` القائم).

**الملفّات المعدَّلة:** `SmartFinanceForm.tsx`، `ExpensesTab.tsx`، `PurchasesTab.tsx`.

**التغييرات الرئيسية:**
- إضافة استيراد `useEffect` و`useUpdateExpense`/`useUpdatePurchase` إلى `SmartFinanceForm`.
- إزالة `ExpenseForm`، `useUpdateExpense`، `updateMutation`، `handleUpdate`،
  `categoriesList` من `ExpensesTab.tsx` (كلّها صارت ميّتة بعد الترحيل).
- إزالة `useUpdatePurchase`، `updateMutation`، `handleUpdate` من `PurchasesTab.tsx`.
  (أُبقي استيراد `PurchaseForm` لأنّه ما زال يُستخدم لمودال الإنشاء فقط.)

**ملاحظات:**
- وضع «أصل للورشة» في التعديل يستدعي `updateExpense` على الصفّ الأساسي (لأنّ
  capital_asset هو في جوهره مصروف بعَلَم `isCapitalAsset=true`) ويُحافِظ على
  الارتباط القائم كما هو. التفاصيل الدقيقة (تعديل `usefulLifeMonths`) متروكة
  كـ TODO لأنّه لا يوجد server action باسم `updateCapitalAsset` ولا hook باسم
  `useUpdateCapitalAsset` بعد.
- عند تعديل مصروف فئته ليست في كتالوج فئات المصاريف، قد يُظهِر الـ Select فراغاً
  لحظياً قبل أن يُقلب `useEffect` الـ `isCustomCategory` إلى `true` (سباق تجميليّ
  أثناء تحميل الكتالوج، مطابق لسلوك `ExpenseForm` القديم).

### الإصلاح #2: زرّ الإضافة العائم في شاشة المخزون (Inventory FAB)

**المشكلة:** شاشة المخزون كانت تفتقر إلى أيّ مسار سريع لإضافة صنف متتبَّع جديد
أو تسوية رصيد صنف موجود — كان المستخدم يضطر للتنقّل إلى شاشة الكتالوج الكاملة.

**الحلّ المُطبَّق:**
- أُضيف `<FloatingActionButton onClick={() => setIsFabOpen(true)} label="إجراءات المخزون" />`
  في نهاية JSX الشاشة.
- أُضيف مودال رئيسي بقائمة ثلاثة خيارات:
  1. **«إضافة صنف مُتابَع»** → يفتح `AddTrackedItemForm` داخل مودال ثانٍ.
  2. **«تعديل سريع للمخزون»** → يفتح `QuickAdjustStockForm` داخل مودال ثالث.
  3. **«إدارة الكتالوج الكامل»** (إضافيّ) → رابط `<Link href="/catalog">`.
- لا تداخل بصريّ بين المودالات الثلاثة (واحد فقط مفتوح في كلّ لحظة عبر ثلاث state hooks).
- **ملفّان جديدان أُنشئا في** `src/features/inventory/components/`:
  - `AddTrackedItemForm.tsx`: نموذج سريع بحقول (الاسم، التكلفة الافتراضية، الوحدة،
    الرصيد الافتتاحي الاختياري، ملاحظات). يضع `tracked: true` افتراضياً. يستدعي
    الـ hook `useCreateCatalogComponent` الذي يُبطِل تلقائياً namespace الكتالوج
    والمخزون عند النجاح (بعد إصلاح QA — انظر القسم الخاص بالـ QA أدناه).
  - `QuickAdjustStockForm.tsx`: نموذج تسوية يستخدم `useAdjustStock` + `useComponentStock`
    لعرض الرصيد الحاليّ، يضمّSelect للصنف المتتبَّع، toggle لاتجاه التسوية
    (in/out)، حقل كمية، حقل سبب اختياري، وتحذيراً عند تجاوز الكمية للرصيد. يُعالج
    حالة «لا توجد أصناف متتبَّعة بعد» بعرض توجيهيّ.

**الملفّات المعدَّلة:** `InventoryScreen.tsx` (معدَّل) + `components/AddTrackedItemForm.tsx` + `components/QuickAdjustStockForm.tsx` (جديدان).

**التغييرات الرئيسية:**
- استيراد `FloatingActionButton`، `ResponsiveModal`، `Plus`، `PackageMinus`، `Package`، والنموذجَين الجديدَين.
- إضافة ثلاث state hooks: `isFabOpen`، `isQuickAdjustOpen`، `isAddItemOpen`.
- تمرير `items` إلى `QuickAdjustStockForm` من بيانات `useInventoryValuation` المُجلبَة مسبقاً في الأب (تجنّب جلب مكرَّر).

**ملاحظات:**
- النموذجان مبنيّان على نمط الـ toasts المُستخدَم في كلّ الشاشات (`sonner.toast`).
- لا يُلمَس أيّ منطق محاسبيّ: كلاهما يستدعي server actions موجودة (`createCatalogComponent`، `adjustStock`) دون تعديل.

### الإصلاح #3: التبويب الافتراضي + إعادة تسمية التبويبات

**المشكلة:** التبويب الافتراضي في `/finance` كان «المشتريات» (بدلاً من «المبيعات»
الأكثر استخداماً)، وأسماء التبويبات كانت بصيغة عامّة (`المصاريف`/`المشتريات`/`المبيعات`)
بدلاً من الصيغة المُتعلِّقة بالمستخدم.

**الحلّ المُطبَّق:**
- في `FinanceClient.tsx`:
  - مصفوفة `TABS` (الأسطر 67-71): `المصاريف` → `مصاريفي`، `المشتريات` → `مشترياتي`، `المبيعات` → `مبيعاتي`.
  - السطر 83: `searchParams.get("tab") || "purchases"` → `searchParams.get("tab") || "sales"`.
  - التعليق الابتدائيّ للتبويب الافتراضيّ تحديثه ليعكس «المبيعات».

**الملفّات المعدَّلة:** `FinanceClient.tsx`.

**التغييرات الرئيسية:** ثلاث سطور فقط (تسميات التبويبات الثلاثة) + سطر واحد للقيمة الافتراضية + تعليق.

**ملاحظات:**
- الكلمة المحظورة «خاماتي» لم تُستخدم (تمّ التحقّق بـ grep عبر `artifacts/zman-app/src` — 0 مطابقات).
- لم تُلمَس تسميات الـ FAB (`مشتريات جديدة`/`مصروف جديد`/`مبيعات جديدة`) لأنّها ليست تسميات تبويبات (هي تسميات إجراءات الإضافة السريعة) — خارجة عن نطاق هذا الإصلاح.

### الإصلاح #4: فلتر الوقت — إعادة التسمية + الإعداد الافتراضي

**المشكلة:** تسمية الفلتر «الكل» كانت غامضة (لا تُوضّح أنّه «منذ بداية النشاط»).
الإعداد الافتراضي كان صحيحاً (`useState(0)` يُشير إلى `presets[0]` = كل الفترات)،
لكنّ التسمية كانت مُربِكة.

**الحلّ المُطبَّق:**
- في `DashboardClient.tsx`:
  - السطر 71: `label: "الكل"` → `label: "منذ البداية"`.
  - السطر 11 (تعليق رأس الملفّ): `«الكل»` → `«منذ البداية»`.
  - السطر 83 (تعليق داخليّ): `«الكل» (index 0)` → `«منذ البداية» (index 0)`.
  - `useState(0)` الابتدائيّ لم يُلزَم تغييره (كان صحيحاً أصلاً).
- الانتشار الديناميكيّ: كلّ مواقع العرض الأربعة (زرّ رأس الموبايل، SegmentedControl للحاسوب، FilterChips في مودال التقويم) تستهلك `presets[i].label` ديناميكياً، فالتغيير الواحد عند التعريف ينتشر في كلّ المواقع.

**الملفّات المعدَّلة:** `DashboardClient.tsx`.

**التغييرات الرئيسية:** إعادة تسمية في 3 مواقع (تعريف + تعليقان).

**ملاحظات:** grep بعد التغيير أكّد 0 مطابقات متبقّية لكلمة `الكل` في الملفّ.

### الإصلاح #5: البطاقة الصحّية — النصّ الميت → روابط

**المشكلة:** صفّا «قيمة مخزونك» و«عربون مستحق التسليم» في `HealthCard` كانا
`<div>` ثابتاً، فلا يستطيع المستخدم النقر عليهما للوصول إلى تفاصيل المخزون أو
الطلبات ذات الصلة.

**الحلّ المُطبَّق:**
- في `DashboardClient.tsx` (داخل `HealthCard`):
  - صفّ «قيمة مخزونك»: استُبدِل الـ `<div>` الخارجيّ بـ`<Link href="/inventory">`
    مع `hover:bg-info/10 hover:underline transition-colors cursor-pointer`.
  - صفّ «عربون مستحق التسليم»: استُبدِل الـ `<div>` الخارجيّ بـ`<Link href="/orders">`
    مع `hover:bg-warn-soft/50 hover:underline transition-colors cursor-pointer`.
  - لم تُلمَس الأرقام، الحسابات، العرض الشرطيّ (`inventoryValueCents > 0`/`asOfDepositsHeldCents > 0`)، أو أيّ fetching — فقط تغليف الـ JSX القائم بـ `<Link>` + classes التظليل.
  - استُورِد `Link` من `next/link` مسبقاً (السطر 30) — لا استيراد جديد مطلوب.
  - تعليقان داخليّان عُدِّلا للإشارة إلى السلوك الجديد («رابط لشاشة المخزون»/«رابط لشاشة الطلبات»).

**الملفّات المعدَّلة:** `DashboardClient.tsx`.

**التغييرات الرئيسية:** تغليف صفَّين بـ `<Link>` مع classes تظليل.

### الإصلاح #6: قفل الخمول — من دقيقتين إلى 10 دقائق

**المشكلة:** `IDLE_LIMIT_MS` كان `2 * 60 * 1000` (دقيقتان)، وهو قصير جدًّا
للورش العمليّة التي يُفتَح فيها التطبيق ويُترَك لفترات دون تفاعل مباشر.

**الحلّ المُطبَّق:**
- في `IdleLock.tsx`:
  - السطر 7 (تعليق): `(دقيقتان)` → `(عشر دقائق)`.
  - السطر 8: `const IDLE_LIMIT_MS = 2 * 60 * 1000;` → `const IDLE_LIMIT_MS = 10 * 60 * 1000;`.
  - السطر 13 (JSDoc): `> دقيقتين` → `> 10 دقائق`.
- لم يُلمَس `lib/db/client.ts` (الذي يحتوي `idle_timeout: 30` وهو إعداد تجمّع
  اتصالات Postgres، لا علاقة له بقفل الخمول على الواجهة).

**الملفّات المعدَّلة:** `IdleLock.tsx`.

**التغييرات الرئيسية:** قيمة الثابت + تعليق + JSDoc.

**ملاحظات:** grep عبر `src/` أكّد أنّ موقع قفل الخمول الوحيد هو `IdleLock.tsx`
(لا تكرار للإعداد في أيّ مكان آخر). الاستيراد الوحيد لـ `IdleLock` هو في
`app/(app)/layout.tsx`.

### الإصلاح #7: نقل زرّ «إدارة الفئات» إلى رأس تبويب المصاريف

**المشكلة:** زرّ «إدارة فئات المصاريف» كان مختبئاً في قائمة «المزيد» السفلية،
ممّا يجعل الوصول إليه غير مباشر ويُخفي ميزة تصنيف المصاريف عن المستخدم الجديد.

**الحلّ المُطبَّق:**
- في `ExpensesTab.tsx`:
  - أُضيف في أعلى محتوى التبويب (قبل قائمة المصاريف):
    ```tsx
    <div className="flex items-center justify-end">
      <Button variant="secondary" size="sm"
        onClick={() => updateUrl({ manageCatalog: "expenses" })}
        icon={<Boxes className="w-4 h-4" />}
        className="text-xs">
        إدارة الفئات
      </Button>
    </div>
    ```
  - يفتح `FinanceCatalogModal type="expenses"` عبر URL param
    `manageCatalog=expenses` الذي يقرؤه `FinanceClient.tsx` ويُعرض المودال تلقائياً.
    لا حاجة إلى prop drilling (خيار المعماريّ 2 من تقرير المهندس).
- في `nav.ts`:
  - حُذِف الإدخال `{ label: "إدارة فئات المصاريف", href: "/finance?manageCatalog=expenses", icon: Boxes }` من `moreNavItems`.
  - أُضيف تعليق توضيحيّ يشير إلى النقل.
  - أُبقي إدخال «إدارة أصناف المشتريات» (لم يكن في النطاق).

**الملفّات المعدَّلة:** `ExpensesTab.tsx`، `nav.ts`.

**التغييرات الرئيسية:**
- إضافة استيراد `Boxes` و`Trash2` من `lucide-react` إلى `ExpensesTab.tsx`.
- حذف استيراد `ExpenseForm` و`useUpdateExpense` من `ExpensesTab.tsx` (ميّت بعد الإصلاح #1).
- إضافة زرّ في رأس التبويب + حذف إدخال من `moreNavItems`.

---

## التحقّق من الجودة (QA)

### فحص الأنواع (TypeScript typecheck)

**الأمر:** `pnpm run typecheck` (يُشغِّل `tsc --build` للمكتبات + `tsc --noEmit` لكلّ من `api-server` و`zman-app` و`mockup-sandbox` و`scripts`).

**النتيجة:** ✅ **نجح** — EXIT=0، لا أخطاء TypeScript.

```
artifacts/api-server typecheck: Done
artifacts/zman-app typecheck: Done
artifacts/mockup-sandbox typecheck: Done
scripts typecheck: Done
```

### بناء الإنتاج (Next.js build)

**الأمر:** `pnpm --filter "@workspace/zman-app" build` (مع `PORT=3000 BASE_PATH=/`).

> ملاحظة: الأمر `pnpm build` على مستوى جذر workspace يُحاول أيضاً بناء
> `mockup-sandbox` (تطبيق Vite شقيق لم يُلمَس في هذه الجولة)، والذي يفشل في هذه
> البيئة لغياب متغيّري بيئة `PORT`/`BASE_PATH` المطلوبَين من `vite.config.ts`.
> هذا فشل بيئيّ سابق، **لا علاقة له بتغييراتنا**. البناء المُستهدَف فعلياً هو
> `zman-app`، وهو نجح.

**النتيجة:** ✅ **نجح** — Next.js 15.5.19، تجميع ناجح في 16.3 ثانية، توليد 17/17 صفحة ثابتة.

```
✓ Compiled successfully in 16.3s
✓ Generating static pages (17/17)

Route (app)                                 Size  First Load JS
┌ ○ /                                    20.7 kB         158 kB
├ ○ /finance                             8.75 kB         146 kB
├ ○ /inventory                           12.4 kB         146 kB
├ ○ /catalog                               15 kB         169 kB
└ ... (17 مساراً إجمالاً)
```

### التحقّق من القيود

| القيد | الحالة | الدليل |
|------|--------|--------|
| لم يتم تعديل أيّ منطق محاسبيّ أو استعلامات DB في الـ backend | ✅ | `git diff -- artifacts/api-server artifacts/zman-app/src/lib/db artifacts/zman-app/src/features/*/db.ts artifacts/zman-app/src/features/*/queries.ts artifacts/zman-app/drizzle` → فارغ |
| لا توجد كلمة «خاماتي» في الكود | ✅ | `grep -r "خاماتي" artifacts/zman-app/src` → 0 مطابقات |
| `lib/db/client.ts` لم يُمَس | ✅ | `git diff -- artifacts/zman-app/src/lib/db/client.ts` → فارغ (إعداد `idle_timeout: 30` لتجمّع Postgres سليم) |
| نموذج التعديل يستخدم `SmartFinanceForm` (لا `ExpenseForm`/`PurchaseForm`) | ✅ | `ExpensesTab.tsx:419` و`PurchasesTab.tsx:356` يعرضان `<SmartFinanceForm initialData={...} />` |
| الفلتر الافتراضي هو «منذ البداية» (All Time) | ✅ | `DashboardClient.tsx:71` label = `"منذ البداية"`؛ السطر 84 `useState(0)` يُشير إلى `presets[0]` |
| لم يتم الـ push إلى GitHub | ✅ | `git log origin/main..HEAD` → 0 التزامات ahead؛ لا توجد أيّ عمليات push في السجلّ |

---

## إصلاح QA إضافيّ (بواسطة الوكيل 5)

### خطأ نوعيّ في `useCreateCatalogComponent` (TODO من الوكيل 4)

**المشكلة:** خطّاف `useCreateCatalogComponent` في `catalog/hooks.ts:26` كان
يُعرِّف `mutationFn` على أنّه يستقبل `Omit<CatalogComponent, "id"|"createdAt"|"updatedAt"|"deletedAt">`
= `{ name, defaultCostCents, unit, notes, tracked }`، **دون** حقل `openingStock`
الذي يقبله الـ server action الأساسيّ (عبر Zod `catalogInputSchema`). هذا
اضطرَّ `AddTrackedItemForm.tsx` إلى تجاوز الـ hook واستدعاء `createCatalogComponent`
مباشرةً + عمل `queryClient.invalidateQueries` يدويّ لكلا الـ namespace.

**الحلّ المُطبَّق (مباشر وقليل المخاطر):**
1. في `catalog/hooks.ts`:
   - تعريف نوع مُصدَّر جديد:
     ```typescript
     export type CreateCatalogComponentInput = Omit<
       CatalogComponent,
       "id" | "createdAt" | "updatedAt" | "deletedAt"
     > & {
       /** رصيد افتتاحي اختياري عند تفعيل التتبّع لأول مرة. */
       openingStock?: number;
     };
     ```
   - تغيير `mutationFn` للـ hook إلى استخدام هذا النوع الجديد.
   - استيراد `inventoryKeys` من `../inventory/hooks` (اتّجاه واحد، لا اعتماد دائريّ — `inventory/hooks.ts` لا يستورد catalog).
   - إضافة `queryClient.invalidateQueries({ queryKey: inventoryKeys.all })` إلى `onSuccess` (متّسق مع كون إنشاء صنف متتبَّع بـ `openingStock>0` يُدرج `catalog_movement` في نفس tx، ممّا يُؤثّر على تقييم المخزون).
2. في `AddTrackedItemForm.tsx`:
   - إعادة هيكلة لاستخدام الـ hook (`useCreateCatalogComponent`) بدلاً من استدعاء الـ action مباشرة.
   - إزالة `useQueryClient` و`Promise.all` اليدويّ للإبطال (يُتولاّه الـ hook الآن).
   - إزالة الاستيرادات غير المستخدمة بعد (`useQueryClient`، `createCatalogComponent`، `catalogKeys`، `inventoryKeys`) وحالة `isSubmitting` المحليّة (تُشتقّ الآن من `createMutation.isPending`).

**التحقّق من التوافقية مع الـ callers الموجودين:** `CatalogClient.tsx` (الـ caller
الوحيد القديم) يُعرِّف `FormValues` محليّاً يضمّ `openingStock: number` ويستدعي
`createMutation.mutateAsync(vals)` بالمرجع (وليس literal). كان TypeScript يمرِّر
ذلك بصمت كـ excess property على الرغم من خطأ النوع. بعد الإصلاح، يقبل نظام
الأنواع `openingStock` صراحةً، فيتطابق التوقيع مع الاستخدام الفعليّ — تحسين
نوعيّ صرف دون تغيير سلوك وقت التشغيل.

**إعادة فحص الأنواع بعد الإصلاح:** ✅ EXIT=0.
**إعادة بناء zman-app بعد الإصلاح:** ✅ 16.3 ثانية، 17/17 صفحة.

---

## ملاحظات و TODOs مستقبلية

1. **TODO دائم (Agent 2 الأصليّ):** تعديل الأصل الرأسماليّ لا يُدعِم تعديل
   `usefulLifeMonths` للصفّ `capital_asset` المرتبط، لأنّه لا يوجد server action
   باسم `updateCapitalAsset` ولا hook باسم `useUpdateCapitalAsset` بعد. تركنا
   التعليق `TODO (Issue #1)` في `SmartFinanceForm.tsx handleAssetSubmit`.الحلّ
   البديل للمستخدم: إيقاف الإهلاك ثم إعادة الإنشاء عبر تدفّق الإنشاء. (لم يُطلَق
   على هذا TODO لأنّ إنشاء الـ action/الـ hook خارج نطاق هذه الجولة.)

2. **TODO تجميليّ (Agent 2):** عند تعديل مصروف فئته ليست في كتالوج فئات
   المصاريف، قد يُظهِر الـ Select فراغاً لحظياً قبل أن يُقلب `useEffect` الـ
   `isCustomCategory` إلى `true` (سباق تجميليّ أثناء تحميل الكتالوج). مطابق
   لسلوك `ExpenseForm` القديم. تركناه كما هو.

3. **شيفرة ميّتة سابقة (Agent 2):** `handleCreate` و`pendingCapitalAsset`
   و`DepreciationPromptModal` في `ExpensesTab` و`PurchasesTab` كانت ميّتة قبل
   هذه الجولة (لأنّ `SmartFinanceForm` يُدير الإنشاء والإهلاك داخلياً). تُرِكَت
   دون لمس لتقليل نطاق التغيير.

4. **نصوص البحث غير مُعاد تسميتها (Agent 3):** placeholders البحث في
   `FinanceClient.tsx` (مثل `"البحث في المشتريات..."`) لم تُعَد تسميتها إلى
   صيغة `«مشترياتي»` لأنّها نصوص بحث وليست تسميات تبويبات، ولم تُذكَر في تعليمات
   المعماريّ الصريحة. متروكة كتحسين لاحقّ محتمل.

5. **`mockup-sandbox` build يحتاج env vars:** البناء على مستوى workspace
   (`pnpm build` من الجذر) يفشل في هذه البيئة لأنّ `mockup-sandbox/vite.config.ts`
   يتطلّب `PORT` و`BASE_PATH`. هذه مشكلة بيئيّة سابقة لا علاقة لها بجولتنا.
   للتشغيل الناجح في CI/الإنتاج: مرِّر `PORT=3000 BASE_PATH=/` (أو ما يناسب
   بيئتك) إلى أمر البناء، أو استخدم `pnpm --filter "@workspace/zman-app" build`
   لبناء تطبيق Next.js وحده.

6. **`QuickAdjustStockForm` مصدر عناصره:** تُمرَّر `items` من
   `useInventoryValuation` في الأب `InventoryScreen`. الاستعلام
   `getInventoryValuation` يفعل `catalogComponent LEFT JOIN catalogMovement`،
   فيُعيد كلّ الأصناف المتتبَّعة بصرف النظر عن فلتر التاريخ (لا يوجد asOfDate
   اليوم)، فلا توجد مشكلة. لو أُضيف فلتر تاريخ للأب مستقبلاً، يلزم التحقّق من
   عدم تغيير مجموعة الأصناف المعروضة.

7. **مودالات متعدّدة في `InventoryScreen`:** ثلاثة `ResponsiveModal` في JSX
   (قائمة FAB + نموذج إضافة + نموذج تسوية). واحد فقط مفتوح في كلّ لحظة، لكن يمكن
   إعادة هيكلتها إلى مودال واحد بآلة حالة داخليةّ لمن يُفضّل كوداً أنظف.

---

## الملفّات المعدَّلة (قائمة كاملة)

| الملفّ | السبب |
|--------|------|
| `artifacts/zman-app/src/features/finance/components/SmartFinanceForm.tsx` | الإصلاح #1: إضافة `initialData` prop ووضع التعديل في المعالجات الثلاثة + تسميات الأزرار + `useEffect` لمزامنة `isCustomCategory` مع الكتالوج. |
| `artifacts/zman-app/src/features/finance/components/ExpensesTab.tsx` | الإصلاح #1: ترحيل مودال التعديل من `ExpenseForm` إلى `SmartFinanceForm` + زرّ حذف مستقلّ. الإصلاح #7: زرّ «إدارة الفئات» في رأس التبويب. إزالة الشيفرة الميّتة (`handleUpdate`/`updateMutation`/`categoriesList`/استيراد `ExpenseForm`/استيراد `useUpdateExpense`). |
| `artifacts/zman-app/src/features/finance/components/PurchasesTab.tsx` | الإصلاح #1: ترحيل مودال التعديل من `PurchaseForm` إلى `SmartFinanceForm` + زرّ حذف مستقلّ. إزالة الشيفرة الميّتة (`handleUpdate`/`updateMutation`/استيراد `useUpdatePurchase`). (أُبقي `PurchaseForm` لمودال الإنشاء فقط.) |
| `artifacts/zman-app/src/app/(app)/finance/FinanceClient.tsx` | الإصلاح #3: إعادة تسمية تسميات TABS إلى `مصاريفي`/`مشترياتي`/`مبيعاتي` + تغيير التبويب الافتراضي إلى `"sales"` + تحديث التعليق. |
| `artifacts/zman-app/src/config/nav.ts` | الإصلاح #7: حذف إدخال `إدارة فئات المصاريف` من `moreNavItems` + تعليق توضيحيّ. |
| `artifacts/zman-app/src/components/auth/IdleLock.tsx` | الإصلاح #6: `IDLE_LIMIT_MS` من `2 * 60 * 1000` إلى `10 * 60 * 1000` + تحديث التعليق وJSDoc. |
| `artifacts/zman-app/src/features/dashboard/components/DashboardClient.tsx` | الإصلاح #4: إعادة تسمية `«الكل»` إلى `«منذ البداية»` (3 مواقع: تعريف + تعليقان). الإصلاح #5: تغليف صفّي `قيمة مخزونك` و`عربون مستحق التسليم` في `<Link href="/inventory">` و`<Link href="/orders">` مع classes تظليل. |
| `artifacts/zman-app/src/features/inventory/InventoryScreen.tsx` | الإصلاح #2: إضافة `FloatingActionButton` + 3 `ResponsiveModal` موصلة بالنموذجَين الجديدَين + رابط `/catalog`. |
| `artifacts/zman-app/src/features/inventory/components/AddTrackedItemForm.tsx` (جديد) | الإصلاح #2: نموذج إضافة صنف متتبَّع جديد. (بعد QA: مستخدمٌ للـ hook `useCreateCatalogComponent` بعد إصلاح نوعه.) |
| `artifacts/zman-app/src/features/inventory/components/QuickAdjustStockForm.tsx` (جديد) | الإصلاح #2: نموذج تسوية سريعة للرصيد عبر `useAdjustStock` + `useComponentStock`. |
| `artifacts/zman-app/src/features/catalog/hooks.ts` | إصلاح QA: إضافة `CreateCatalogComponentInput` (يضمّ `openingStock?: number`) + استخدامه في `useCreateCatalogComponent` + إبطال `inventoryKeys.all` في `onSuccess`. |

**الإجمالي:** 8 ملفّات معدَّلة + 2 ملفّان جديدان + 1 ملفّ hook مُصلَّح = **11 ملفّاً**.

---

## الخلاصة

تمّ إنجاز جولة الإصلاحات السريعة والهيكلية بالكامل، مع التزام صارم بالقيود
الستّة (لا لمس للـ backend، لا لكلمة «خاماتي»، لا لـ`lib/db/client.ts`، استخدام
`SmartFinanceForm` للتعديل، الفلتر الافتراضي «منذ البداية»، لا push إلى GitHub).
جميع الإصلاحات السبعة مُتحقَّق منها فعلياً في الشيفرات، وأخطاء الأنواع معدومة،
وبناء Next.js للإنتاج أخضر (17/17 صفحة ثابتة).

أثناء المراجعة، عالج الوكيل 5 خطأً نوعيّاً كان قد تُرِكَ كـ TODO في
`useCreateCatalogComponent`، وأعاد هيكلة `AddTrackedItemForm.tsx` لاستخدام
الـ hook المُصلَّح بدلاً من الاستدعاء المباشر للـ server action — تحسين جودة
الشيفرة دون تغيير السلوك الوظيفيّ. التغييرات كلّها محليّة في شجرة العمل
(uncommitted)، ولم تُدفَع إلى GitHub.

النتيجة النهائية: تطبيق ZMAN PWA أكثر اتّساقاً (نموذج موحَّد للإنشاء والتعديل)،
أكثر إنتاجيّة (FAB للمخزون + روابط حيّة في البطاقة الصحّية + زرّ فئات مرئيّ)،
وأكثر ملاءمةً لسياق الورش الصغيرة (تبويب افتراضيّ مبيعات، فلتر افتراضيّ «منذ
البداية»، قفل خمول 10 دقائق، تسميات تبويبات بصيغة المُتعلِّقة بالمستخدم).
