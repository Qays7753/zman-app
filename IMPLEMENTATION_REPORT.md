# ZMAN Financial Remediation Audit Report (Findings F-01 to F-14)

This report details the final implementation, design decisions, and line-by-line verification for findings F-01 to F-14.

---

## 1. Executive Summary & Design Decisions

### D1: Strict Cash Basis
All financial aggregates (sales, purchases, expenses) are derived from realized cash ledger movements (`cash_movement` table) and cash accounts. Estimates or accrual-basis values from orders or sales tables are strictly separated.

### D2: Orders vs. Finance Separation
Order prices and statuses represent estimated or anticipated revenue. They are labeled as such ("تقديري" or "متوقّع") and are never summed into realized cash positions.

### F-05: Real Reconciliation & Design Decision
- **Decision Taken:** **Option (b) - Archived-Inclusive Reconciliation on Both Sides**.
- **Rationale:** To avoid scope mismatches, the balance sheet calculations (`retainedProfitCents`, `openingCashInEquityCents`, `injectionsCents`, `drawingsCents`, `totalAssets`) and ledger P&L calculations (`ledgerPnlNetCents`) are all computed using an archived-inclusive scope (no `eq(account.isArchived, false)` filter on the queries). This guarantees that historical transactions in archived accounts are fully included on all sides, keeping the balance sheet perfectly balanced while permitting a real, non-tautological reconciliation between the ledger and the source tables.
- **Drift Diagnosis:** The live database has an initial drift of **163,000 fils**. Detailed analysis resolved this to 3 active purchase records in the `purchase` table that do not have any matching `cash_movement` records in the ledger:
  - Purchase ID: `7d0fb8fd` ("نباتات") - `75,000` fils
  - Purchase ID: `2aab8124` ("طباعة") - `24,000` fils
  - Purchase ID: `756cb784` ("كرتون ابيض") - `64,000` fils
  - **Total missing ledger outflow:** `163,000` fils.
  - Since these 3 rows are active in the source table but missing from the ledger, they create a genuine drift of exactly `163,000` fils. Because this is a true database anomaly, a red banner is displayed to the owner on the Reports page.

---

## 2. Corrections to my previous report

- **F-04**: Previously incorrectly reported as "Verified" (Pre-remediation). It is now **IMPLEMENTED** (hybrid queries replaced with ledger-only queries).
- **F-08**: Previously incorrectly reported as "Verified" (Pre-remediation). It is now **IMPLEMENTED** (all-time warning sublabel added to the Dashboard).
- **F-09**: Previously incorrectly reported as "Verified" (Pre-remediation). It is now **IMPLEMENTED** (opening balance input decimal formatting implemented using `formatFilsToInput`).
- **F-13**: Previously incorrectly reported as "Verified". It is now **IMPLEMENTED** (dead schema files moved to a legacy directory).

---

## 3. Findings Audit & Implementation Map

| ID | Status | File Path & Lines | Description / Resolution |
| :--- | :--- | :--- | :--- |
| **F-01** | `IMPLEMENTED` | [SalesTab.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/components/SalesTab.tsx#L171-L177) | Renders `item.amountCents - (Number(depositCents) \|\| 0)` (remainder posted to ledger) instead of full amount. |
| **F-02** | `IMPLEMENTED` | [SalesTab.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/components/SalesTab.tsx#L167-L172) | Added `title` and `aria-label` to the sales card headline amount to clarify it is the full order price. |
| **F-03** | `IMPLEMENTED` | [reports/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/reports/actions.ts#L154-L200) | Groups cash movement sourceType (deposit vs sale) in Excel/CSV downloads. |
| **F-04** | `IMPLEMENTED` | [reports/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/reports/actions.ts#L49-L84) <br> [dashboard/queries.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/dashboard/queries.ts#L44-L76) <br> [dashboard/queries.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/dashboard/queries.ts#L217-L252) | Purchases and expenses legs in `computeCashBasisPnl`, `getFinancialSummary`, and `getFinancialTrendData` rewritten to query `cashMovement` directly rather than source tables. |
| **F-05** | `IMPLEMENTED` | [reports/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/reports/actions.ts#L535-L690) <br> [reports/page.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/app/(app)/reports/page.tsx#L729-L778) <br> [integrityCheck.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/integrityCheck.ts#L605-L685) | Implemented real non-tautological reconciliation on archived-inclusive aligned scope. Added `IC-8` to the financial integrity check tool on the Reports page. |
| **F-06** | `IMPLEMENTED` | [finance/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/actions.ts#L1674-L1685) <br> [finance/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/actions.ts#L1865-L1871) <br> [OwnerTab.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/components/OwnerTab.tsx#L262) <br> [AccountsTab.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/components/AccountsTab.tsx#L321) | Server validation prevents owner transactions or opening balance updates on archived accounts. Dropdowns filter them out. (Deviation: deletedAt checks and FOR UPDATE locks on these guards were omitted). |
| **F-07** | `ALREADY-RESOLVED` | [finance/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/actions.ts#L1485-L1488) | SQL-level `eq(account.isArchived, false)` checked by default in `getAccountBalances` queries. |
| **F-08** | `IMPLEMENTED` | [dashboard/components/DashboardClient.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/dashboard/components/DashboardClient.tsx#L353-L355) | Added all-time cumulative warning sublabel under "النقد الحر" hero number. |
| **F-09** | `IMPLEMENTED` | [finance/components/OpeningTab.tsx](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/finance/components/OpeningTab.tsx#L23-L25) | Displays existing opening values via `formatFilsToInput` (3-decimal formatter) on load. |
| **F-10** | `NO-CHANGE` | *N/A* | Realized sales are recognized on a cash basis when the settlement actually occurs (which is the conversion date), making `today` correct. |
| **F-11** | `IMPLEMENTED` | [reports/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/reports/actions.ts#L49-L84) | Extracted `computeCashBasisPnl` shared query helper. |
| **F-12** | `IMPLEMENTED` | [reports/actions.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/artifacts/zman-app/src/features/reports/actions.ts#L285-L294) | Re-labeled product export headers and titles to reflect estimated ordered quantities instead of realized revenues. |
| **F-13** | `IMPLEMENTED` | [legacy/index.ts](file:///c:/Users/Qaysk/OneDrive/Desktop/Zman New/lib/db/src/schema/index.ts#L1-L2) | Moved dead schema files `finance.ts` and `orders.ts` to `lib/db/src/schema/legacy/` and updated index exports. |
| **F-14** | `NO-CHANGE` | *N/A* | Rate limiting left as-is as a security boundary. |

---

## 4. Integrity Checks Reference Summary

| Check ID | Title & Invariant | Invariant Assertion Summary |
| :--- | :--- | :--- |
| **IC-1** | توازن الميزانية (INV-11) | Asserts that Ledger Equity (Assets − Liabilities) equals Components Equity (Capital + Injections − Drawings + Retained Profit). |
| **IC-2** | لا حركات يتيمة (INV-1, INV-2) | Asserts every cash movement has a valid, non-deleted parent record (sale, purchase, expense, order, or owner transaction). |
| **IC-3** | اتساق عربونات الطلبات (INV-3, INV-9) | Asserts active orders with deposit > 0 have exactly one ledger movement; delivered/cancelled orders have none. |
| **IC-4** | لا ازدواج عربون (INV-4) | Asserts ledger entry for order-linked sales matches the remainder (price − depositCents). |
| **IC-5** | مؤرشف برصيد صفري (INV-13, INV-14) | Asserts no archived account has a non-zero cash ledger balance. |
| **IC-6** | تسوية صافي الأرباح (INV-12) | Asserts Net P&L (sales cash-in minus cash-out) is equal to `retainedProfit + depositsLiability` (internal balance sheet reconciliation). |
| **IC-7** | اتساق وحدة المال (INV-15, INV-16) | Asserts no cash account has a negative ledger balance. |
| **IC-8** | مطابقة سجل النقد (F-05-drift) | Asserts Ledger cash basis Net P&L matches Source Tables basis Net P&L (`sale + order deposits − purchase − expense`). Detects database-level data drift. |

---

## 5. Verification & Testing Outputs

### 5.1 Static Compilation & Type Safety
- **Typecheck output:**
```
> @workspace/zman-app@0.1.0 typecheck C:\Users\Qaysk\OneDrive\Desktop\Zman New\artifacts\zman-app
> tsc --noEmit
```
Completed with **0 errors**.

- **Build output:**
Successfully built all static routes with Next.js compiler.

### 5.2 Verification of F-04 Grep Check
Running `git grep -n "purchase.totalCents\|expense.amountCents" artifacts/zman-app/src/features/reports/actions.ts`:
```
artifacts/zman-app/src/features/reports/actions.ts:141:          total: sum(expense.amountCents),
artifacts/zman-app/src/features/reports/actions.ts:147:        .orderBy(desc(sql`sum(${expense.amountCents})`));
artifacts/zman-app/src/features/reports/actions.ts:387:            total: sum(expense.amountCents),
artifacts/zman-app/src/features/reports/actions.ts:393:          .orderBy(desc(sql`sum(${expense.amountCents})`)),
artifacts/zman-app/src/features/reports/actions.ts:738:        .select({ total: sum(purchase.totalCents) })
artifacts/zman-app/src/features/reports/actions.ts:744:        .select({ total: sum(expense.amountCents) })
```
- **Conformity validation:** All hits outside the new `computeCashBasisPnl` helper are fully intentional: lines 141 and 387 are for the on-screen expenses breakdown by category (which does not exist in `cash_movement`), and lines 738/744 are for the source-basis side of the F-05 reconciliation.

### 5.3 Live Integrity Check Run (runFinancialIntegrityCheck)
```
--- Running Financial Integrity Audit ---
As Of Date:      2026-07-08
Overall Status:  FAIL
Summary:         توجد مشاكل مالية تحتاج إصلاحًا. راجع التفاصيل أدناه.
-----------------------------------------
[IC-1] توازن الميزانية (فحص حقيقي) (INV-11)
  Status:      PASS
  Description: يقارن حقوق الملكية المحسوبة من السجل (204.800 د.أ) مع حقوق الملكية المحسوبة من المكوّنات (204.800 د.أ). يجب أن يتطابقا.
  Drift:       0 fils
-----------------------------------------
[IC-2] لا توجد حركات يتيمة في السجل (INV-1, INV-2)
  Status:      PASS
  Description: كل حركة في cash_movement يجب أن يكون لها صف أب في الجدول المناسب (مبيعة/مصروف/شراء/طلب/معاملة مالك). التحويلات يجب أن تأتي بأزواج (داخل + خارج بنفس المعرّف).
  Count:       0
-----------------------------------------
[IC-3] اتساق عربونات الطلبات مع السجل (INV-3, INV-9)
  Status:      PASS
  Description: كل طلب غير مُسلَّم بعربون > 0 يجب أن يكون له حركة عربون واحدة نشطة. الطلبات المُسلَّمة/الملغاة يجب ألا يكون لها حركة عربون نشطة.
  Count:       0
-----------------------------------------
[IC-4] لا ازدواج عدّ للعربون في المبيعات (INV-4)
  Status:      PASS
  Description: لكل مبيعة محوَّلة من طلب: المبلغ المُرحَّل للسجل (مصدر 'sale') يجب أن يساوي (سعر الطلب − العربون). لو ساوى السعر الكامل، فالعربون محسوب مرتين.
  Count:       0
-----------------------------------------
[IC-5] لا يوجد حساب مؤرشف برصيد غير صفري (INV-13, INV-14)
  Status:      PASS
  Description: أرشفة حساب برصيد غير صفري تُخفي أمواله من الميزانية ولوحة القيادة. يجب تحويل الرصيد قبل الأرشفة.
  Count:       0
-----------------------------------------
[IC-6] تسوية صافي الأرباح مع الميزانية (INV-12)
  Status:      PASS
  Description: صافي الأرباح (أساس نقدي) = 204.800 د.أ. الأرباح المحتجزة + العربونات كالتزام = 204.800 د.أ. يجب أن يتطابقا.
  Drift:       0 fils
-----------------------------------------
[IC-7] اتساق وحدة المال والأرصدة (INV-15, INV-16)
  Status:      PASS
  Description: يتحقّق من عدم وجود حسابات برصيد سالب غير مبرَّر (قد يعني حركة خارجة أكبر من المتاح، أو خطأ إدخال).
  Count:       0
-----------------------------------------
[IC-8] مطابقة سجل النقد مع الجداول المساعدة (F-05-drift)
  Status:      FAIL
  Description: صافي أرباح السجل النقدي = 244.800 د.أ. صافي أرباح الجداول المساعدة = 81.800 د.أ. الانحراف = 163.000 د.أ.
  Drift:       163000 fils
  Suggested:   يوجد انحراف قدره 163.000 د.أ. ناتج عن فوارق بين سجل النقد والجداول المساعدة. تحقّق من المشتريات أو المصاريف غير المسجلة بالسجل.
-----------------------------------------
```

### 5.4 F-05 Negative Test Output (Simulation of Drift)
A transaction-level negative verification test was run to verify the accuracy of the drift calculation. 
- **Simulating drift:** Soft-deleted cash movement `620bc09d-cb6f-462b-a376-17eb34ec4c91` (value = `68,000` fils, associated with PVC Box purchase):
```
Initial Ledger P&L:   244800 fils
Initial Source P&L:   81800 fils
Initial Drift:        163000 fils

Simulating drift: soft-deleting cash movement '620bc09d-cb6f-462b-a376-17eb34ec4c91' (value = 68,000 fils)...
Modified Ledger P&L:  312800 fils
Modified Source P&L:  81800 fils
Modified Drift:       231000 fils
Change in Drift:      68000 fils

TEST PASSED: Soft-deleting 68,000 fils movement increased drift (in absolute terms) by exactly 68,000 fils!
Transaction successfully rolled back. Database is clean.
```
