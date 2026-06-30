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

monorepo بإدارة pnpm workspace. التطبيق القابل للنشر هو `artifacts/zman-app` (Next.js 15 App Router، اسم الحزمة `@workspace/zman-app`). Vercel يبني عبر `vercel.json` في الجذر الذي يبني هذه الحزمة وحدها (`pnpm --filter`) متجاوزاً المشاريع التجريبية مثل `mockup-sandbox`.
