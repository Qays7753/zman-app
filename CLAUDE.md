# CLAUDE.md — قواعد المشروع

## النشر و git push — قاعدة إلزامية

**أي رفع (push) يجب أن يذهب إلى كل المستودعات البعيدة بدون تمييز.** لا تدفع لمستودع واحد وتترك الآخر — المستودعات يجب أن تبقى متطابقة دائماً على نفس الكومت.

المستودعات البعيدة الحالية:
- `origin` → https://github.com/balqeesemad1996/zman-app.git
- `qays` → https://github.com/Qays7753/zman-app.git

عند كل دفعة، نفّذ الدفع لكليهما:
```bash
git push origin main
git push qays main
```
(وأي remote إضافي يُضاف مستقبلاً يدخل ضمن نفس القاعدة.)

السبب: Vercel مربوط بـ `Qays7753/zman-app`، والمستودع الأساسي للمالك هو `balqeesemad1996/zman-app`. إبقاؤهما متطابقين يضمن أن أي تعديل يُنشر فعلاً ولا يضيع.

## ملفات لا تُرفع أبداً (مُدرجة في .gitignore)

- `.env` و`.env.*` — أسرار قاعدة البيانات (DATABASE_URL, PASSCODE). **لا تُرفع إطلاقاً.**
- `.next/`, `.open-next/`, `.wrangler/` — مخرجات بناء مؤقتة (سبق أن نفّخت التاريخ لـ 609MB؛ نُظّفت).
- `.claude/`, `next-env.d.ts`, `GEMINI_*.md` — ملفات محلية/مؤقتة.

## بنية المشروع

monorepo بإدارة pnpm workspace. التطبيق القابل للنشر هو `artifacts/zman-app` (Next.js 15 App Router، اسم الحزمة `@workspace/zman-app`). Vercel مُعدّ عبر Dashboard (لا يوجد `vercel.json`) — الـ Root Directory مضبوط على `artifacts/zman-app` مباشرة.

## Financial Model — Core Business Rule (Never Violate)

This model is the **source of truth** for any work touching money, orders, the dashboard, or
reports. Any change that contradicts it is a break in business logic.

**ملخص بالعربي:** النظام المالي صندوق بسيط تجميعي (واردات − صادرات) لا يتتبّع المخزون ولا
تكلفة كل منتج. نظام الطلبات منفصل تماماً وأرقامه تقريبية ولا تدخل المالي. الجسر الوحيد هو
لحظة التسليم (تحويل الطلب لإيراد كامل). الربح تراكمي لا فوري. العربون لا يُحسب ربحاً/إيراداً
إلا عند تسليم الطلب وتحويله لمبيعة — قبلها هو نقد والتزام فقط، لا ربح.

### Principle: a simple cash box — inflows and outflows only
The financial system is **purely aggregate**. It does NOT track inventory or per-product cost.
Profit/Loss = `total sales − total purchases − total expenses`. No COGS, no matching cost to sale.

### Two fully separate systems
1. **Financial system** = the official truth. Aggregate. It alone determines profit.
2. **Orders system** = fully separate, for order tracking only. Its prices/costs are
   **approximate and inaccurate** (a rough per-order profit hint). **Order numbers never enter
   the financial system** — no financial/profit calculation is built on order component costs.

### The only bridge = the delivery moment
When an order is delivered it is converted into the financial system **as full revenue** with no
cost deducted from it (its cost already entered finance earlier as "purchases" when materials
were bought). Conversion happens via `convertOrderToSale`.

### Profit is cumulative, not immediate
Large quantities are bought at once and sold gradually over months. So buying months look like a
"loss", and profit appears later when selling from already-paid inventory. The aggregate system
measures this truthfully over time. **Do NOT "fix" the loss in a buying month — it is correct.**

### The deposit — the only exception (owner's decision)
A deposit is cash received **before** delivery. Rule: **a deposit is NOT counted as revenue/profit
until the order is delivered and converted to a sale**, even though the cash is already in the box.
Therefore:
- The deposit **appears in**: available cash (real balance), "deposits held" (liability/debt),
  "available liquidity".
- The deposit **must NOT enter**: profit / "monthly net" / "net cash flow". Revenue for profit = `sale` only.
- In `convertOrderToSale`, revenue is recorded as `sale` for `price − deposit` (remainder only),
  so the deposit is never double-counted. This is correct; do not change it.
- Reference: `reports/actions.ts` already subtracts deposits from retained profit
  (`retainedProfit = salesCashIn − deposits − cashOut`). The dashboard must be consistent with this.

## pnpm و Vercel — قواعد حرجة

- المشروع يستخدم **pnpm v10**. الإصدار مُثبّت في `package.json` عبر `"packageManager": "pnpm@10.32.1"` — **لا تُزِل هذا الحقل** وإلا سيستخدم Vercel إصدار pnpm قديم ويفشل النشر.
- **الـ overrides** (esbuild, lightningcss, rollup, إلخ) موجودة في `pnpm-workspace.yaml` (ليس package.json) — هذا خاص بـ pnpm v10. أي تعديل على overrides يتطلب تحديث `pnpm-lock.yaml` عبر `pnpm install`.
- عند إضافة حزمة جديدة أو تعديل `pnpm-workspace.yaml`، شغّل `pnpm install` محلياً وارفع `pnpm-lock.yaml` المُحدّث مع الكومت — وإلا يفشل `--frozen-lockfile` على Vercel.
- سكربت `preinstall` في الجذر يستخدم `sh` (Linux). على Windows استخدم `--ignore-scripts` عند الحاجة لإعادة توليد الـ lockfile.
