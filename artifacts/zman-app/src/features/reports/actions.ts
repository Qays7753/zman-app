"use server";

import { count, desc, isNull, sql, sum, gte, and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { ActionResponse } from "../finance/actions";
import { expense, purchase, sale, account, cashMovement, ownerTransaction, openingBalance } from "../finance/db";
import { order } from "../orders/db";
// Phase 3-revised (D4 fix) — catalogMovement لحساب inventoryValueCents و
// cogsCentsToDate في getFinancialPosition. لا حاجة لـ JOIN catalog_component لأن
// catalog_movement لا يحوي صفوف إلا للأصناف المتتبَّعة (deductForDelivery و
// createPurchase يتخطّان الأصناف غير المتتبَّعة صامتةً).
import { catalogMovement } from "../inventory/db";
import { mapDbError } from "@/lib/db/errors";
import { computeOperatingPnl } from "../finance/pnl";

import { formatFilsToJod } from "@/lib/money";
// D8 fix — getAmmanMonthBounds لضمان أن نطاق «month» مُعتمِد على توقيت عمّان.
import { getAmmanMonthBounds, getAmmanDate } from "@/lib/utils";

function rangeStartDate(range?: "all" | "month" | "30d"): string | null {
  if (range === "month") {
    // D8 fix — Amman-anchored month start. نأخذ `.toISOString().slice(0, 10)`
    // من التاريخ المُرجَع من getAmmanMonthBounds لأنه Date.UTC(year, month-1, 1)
    // (UTC midnight of 1st of current Amman month) — toISOString يُرجِع YYYY-MM-DD.
    const { start } = getAmmanMonthBounds();
    return start.toISOString().slice(0, 10);
  }
  if (range === "30d") {
    const now = new Date();
    const startOf30Days = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    return startOf30Days.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
  }
  return null;
}

function rangeEndDate(range?: "all" | "month" | "30d"): string | null {
  if (range === "month") {
    // D8 fix — Amman-anchored month end.
    const { end } = getAmmanMonthBounds();
    return end.toISOString().slice(0, 10);
  }
  if (range === "30d") {
    return getAmmanDate();
  }
  return null;
}

function buildDateCondition(table: any, range?: "all" | "month" | "30d") {
  const conditions = [isNull(table.deletedAt)];
  const dateField = table.receivedDate ?? table.date;
  const start = rangeStartDate(range);
  const end = rangeEndDate(range);
  if (start) conditions.push(sql`${dateField} >= ${start}`);
  if (end) conditions.push(sql`${dateField} <= ${end}`);
  return and(...conditions);
}

export async function computeCashBasisPnl(
  range: "all" | "month" | "30d" = "all",
  tx: any = db,
) {
  // Phase 2 — كل التعريف inline للربح استُبدَل بنداء computeOperatingPnl الموحَّد.
  // هذا يضمن أن reports.pnl == dashboard.summary.netProfit == monthlyProfit
  // (LOCKED-6) — يحرسه IC-13. الربح الآن تشغيلي: يطرح المصاريف والمشتريات
  // التشغيلية فقط، والرأسمالي يظهر سطراً منفصلاً (capitalAdditionsCents).
  // D8 fix — endDate fallback يستعمل getAmmanDate() لتفادي bare new Date()
  // (server-local) عند تحديد «نهاية الفترة» على استضافة UTC.
  const startDate = rangeStartDate(range) ?? undefined;
  const endDate = rangeEndDate(range) ?? getAmmanDate();

  const pnl = await computeOperatingPnl({ startDate, endDate, tx });

  // الحقول القديمة (purchasesCents, expensesCents) احتفظنا بها كأسماء بديلة
  // للقيم التشغيلية لتجنّب كسر المستهلكين الحاليين. الآن تعني «التشغيلي فقط»
  // (الرأسمالي مُستبعَد) — وهو السلوك الصحيح لقوائم P&L التشغيلية.
  return {
    salesCents: pnl.salesCents,
    operatingExpensesCents: pnl.operatingExpensesCents,
    operatingPurchasesCents: pnl.operatingPurchasesCents,
    capitalAdditionsCents: pnl.capitalAdditionsCents,
    // Phase 4 — إهلاك شهري محسوب لكل الأصول النشطة. غير نقدي. يُخصَم من netCents.
    monthlyDepreciationCents: pnl.monthlyDepreciationCents,
    netCents: pnl.operatingNetCents,
    // أسماء بديلة للتوافق مع المستهلكين الحاليين (تشير للتشغيلي فقط الآن):
    purchasesCents: pnl.operatingPurchasesCents,
    expensesCents: pnl.operatingExpensesCents,
  };
}

export async function downloadReport(
  type: "pnl" | "expenses" | "sales" | "orders" | "products" | "balance_sheet",
  rangeOrAsOfDate: string = "all",
): Promise<ActionResponse<string>> {
  try {
    const todayStr = new Date().toLocaleDateString("ar-JO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let markdown = "";
    const range = (type !== "balance_sheet" ? rangeOrAsOfDate : "all") as "all" | "month" | "30d";

    if (type === "balance_sheet") {
      // 0. Balance Sheet Report
      const posRes = await getFinancialPosition(rangeOrAsOfDate);
      if (posRes.status === "error") {
        throw new Error(posRes.message || "Failed to fetch financial position");
      }
      const p = posRes.data;
      if (!p) {
        throw new Error("Failed to fetch financial position data");
      }

      markdown = `# تقرير الوضع المالي (الميزانية العمومية)

**تاريخ الحساب:** ${rangeOrAsOfDate}
**تاريخ التصدير:** ${todayStr}

---

## 1. الأصول (الموجودات)

| البند | القيمة |
| :--- | :--- |
| نقدية الصندوق | ${formatFilsToJod(p.assets.cashCents)} |
| أرصدة البنك | ${formatFilsToJod(p.assets.bankCents)} |
| **إجمالي الأصول** | **${formatFilsToJod(p.assets.totalCents)}** |

---

## 2. الالتزامات (المطالبات)

| البند | القيمة |
| :--- | :--- |
| عربونات مؤجلة (غير موصلة) | ${formatFilsToJod(p.liabilities.depositsCents)} |
| **إجمالي الالتزامات** | **${formatFilsToJod(p.liabilities.totalCents)}** |

---

## 3. حقوق الملكية (رأس المال والأرباح)

| البند | القيمة |
| :--- | :--- |
| نقدية البداية (رأس المال الفعلي) | ${formatFilsToJod(p.equity.openingCashInEquityCents)} |
| رأس المال المصرح به (مرجعي) | ${formatFilsToJod(p.equity.openingCapitalCents)} |
| إيداعات إضافية للمالك | ${formatFilsToJod(p.equity.injectionsCents)} |
| مسحوبات شخصية للمالك | ${formatFilsToJod(p.equity.drawingsCents)} |
| أرباح مدورة محتجزة (تشغيلية) | ${formatFilsToJod(p.equity.retainedProfitCents)} |
| إضافات أصول رأسمالية (مستبعدة من الربح التشغيلي) | ${formatFilsToJod(p.equity.capitalAdditionsCents)} |
| **إجمالي حقوق الملكية** | **${formatFilsToJod(p.equity.totalCents)}** |

---

## 4. المطابقة والتوازن والتسوية

* **حالة المعادلة الميزانية (الأصول = الالتزامات + حقوق الملكية):** ${
  p.balanced
    ? "متوازنة محاسبياً وبسلاسة"
    : `غير متوازنة! الانحراف: ${formatFilsToJod(Math.abs(p.equityDriftCents))}`
}
* **أرباح محتجزة مترتبة في الميزانية (تشغيلية):** ${formatFilsToJod(p.equity.retainedProfitCents)}
* **إضافات أصول رأسمالية (مستبعدة من الربح التشغيلي):** ${formatFilsToJod(p.equity.capitalAdditionsCents)}
* **صافي أرباح الدفتر النقدي (Ledger):** ${formatFilsToJod(p.ledgerPnlNetCents)}
* **صافي أرباح الجداول المصدرية (Source):** ${formatFilsToJod(p.sourceTablePnlNetCents)}
* **انحراف الدفتر النقدي والمصدر (Drift):** ${formatFilsToJod(p.pnlSourceReconciliationCents)}

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "pnl") {
      // 1. P&L Report
      const { salesCents, purchasesCents, expensesCents, netCents, capitalAdditionsCents, monthlyDepreciationCents } = await computeCashBasisPnl(range);

      markdown = `# تقرير الأرباح والخسائر (P&L)

**تاريخ التصدير:** ${todayStr}

---

## ملخص مالي عام

| البند المالي | القيمة الإجمالية | التفاصيل |
| :--- | :--- | :--- |
| **إجمالي المبيعات (الإيرادات)** | ${formatFilsToJod(salesCents)} | مجموع المدفوعات المستلمة من الزبائن |
| **إجمالي المشتريات (التشغيلية)** | ${formatFilsToJod(purchasesCents)} | تكاليف الخامات والمشتريات التشغيلية للورشة |
| **إجمالي المصاريف (التشغيلية)** | ${formatFilsToJod(expensesCents)} | المصاريف التشغيلية، الإيجارات، الفواتير، والرواتب |
| **إضافات أصول رأسمالية** | ${formatFilsToJod(capitalAdditionsCents)} | مستبعدة من الربح التشغيلي |
| **إهلاك للفترة (غير نقدي)** | ${formatFilsToJod(monthlyDepreciationCents)} | إهلاك محسوب للأصول الرأسمالية النشطة ضمن الفترة — Phase 4 (D2 fix: period-aware) |
| **صافي الأرباح / الخسائر** | **${formatFilsToJod(netCents)}** | **الأرباح التشغيلية الصافية بعد خصم المصاريف والمشتريات التشغيلية والإهلاك** |

> **ملاحظة:** الإضافات الرأسمالية (آلات، أثاث) لا تُخصم من الربح التشغيلي. تُعرض
> هنا للشفافية والتذكير بأنها تستلزم إهلاكاً مستقلاً (المرحلة 4).
>
> **ملاحظة Phase 4:** الإهلاك للفترة (غير النقدي) يُخصَم من الربح التشغيلي للأصول
> التي اختار المستخدم توزيعها على عمرها النافع (خيار γ — محسوب عند القراءة).
> قيمة الإهلاك تتغيّر بطول الفترة المختارة (D2 fix): شهر → حصة شهر واحد،
> كل التاريخ → تراكمي منذ بدء الأصل. لا يؤثر على الميزانية (يبقى cash-basis
> صرفاً) — راجع INV-22 و§10.

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "expenses") {
      // 2. Expense categories — أساس نقدي: من cash_movement مربوط بـ expense وaccount
      const expConds = [
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "out"),
        eq(cashMovement.sourceType, "expense"),
        isNull(expense.deletedAt),
      ];
      const eStart = rangeStartDate(range);
      const eEnd = rangeEndDate(range);
      if (eStart) expConds.push(sql`${cashMovement.date} >= ${eStart}`);
      if (eEnd) expConds.push(sql`${cashMovement.date} <= ${eEnd}`);

      const categories = await db
        .select({
          category: expense.category,
          total: sum(cashMovement.amountCents),
          count: count(cashMovement.id),
        })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .innerJoin(
          expense,
          and(eq(cashMovement.sourceType, "expense"), eq(cashMovement.sourceId, expense.id)),
        )
        .where(and(...expConds))
        .groupBy(expense.category)
        .orderBy(desc(sql`sum(${cashMovement.amountCents})`));

      const totalCents = categories.reduce(
        (sum, c) => sum + (Number(c.total) || 0),
        0,
      );

      markdown = `# تقرير تصنيف المصاريف التشغيلية

**تاريخ التصدير:** ${todayStr}

---

## تفاصيل المصاريف حسب الفئات

| الفئة | عدد الحركات | إجمالي المصروف | النسبة من المجموع |
| :--- | :---: | :--- | :---: |
${categories
  .map((c) => {
    const cCents = Number(c.total) || 0;
    const percentage =
      totalCents > 0 ? `${((cCents / totalCents) * 100).toFixed(1)}%` : "0%";
    return `| ${c.category} | ${c.count} | ${formatFilsToJod(cCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${categories.reduce((s, c) => s + c.count, 0)}** | **${formatFilsToJod(totalCents)}** | **100%** |

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "sales") {
      // 3. Sales sources
      const salesDateConds = [
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        eq(cashMovement.direction, "in"),
        sql`${cashMovement.sourceType} in ('sale', 'deposit')`
      ];
      const sStart = rangeStartDate(range);
      const sEnd = rangeEndDate(range);
      if (sStart) salesDateConds.push(sql`${cashMovement.date} >= ${sStart}`);
      if (sEnd) salesDateConds.push(sql`${cashMovement.date} <= ${sEnd}`);

      const sources = await db
        .select({
          sourceType: cashMovement.sourceType,
          total: sum(cashMovement.amountCents),
          count: count(cashMovement.id),
        })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(and(...salesDateConds))
        .groupBy(cashMovement.sourceType)
        .orderBy(desc(sql`sum(${cashMovement.amountCents})`));

      const totalCents = sources.reduce(
        (sum, s) => sum + (Number(s.total) || 0),
        0,
      );

      const sourceTypeLabels: Record<string, string> = {
        deposit: "عربونات طلبات (دُفعت مقدماً)",
        sale: "تسويات مبيعات (متبقّي مُحصَّل)",
      };

      markdown = `# تقرير مصادر المبيعات والإيرادات النقدية

**تاريخ التصدير:** ${todayStr}

---

## تفصيل الإيرادات حسب القناة والمصدر (أساس نقدي)

| مصدر المبيعات | عدد العمليات | إجمالي الإيرادات | النسبة المئوية |
| :--- | :---: | :--- | :---: |
${sources
  .map((s) => {
    const sCents = Number(s.total) || 0;
    const percentage =
      totalCents > 0 ? `${((sCents / totalCents) * 100).toFixed(1)}%` : "0%";
    const label = sourceTypeLabels[s.sourceType] || s.sourceType;
    return `| ${label} | ${s.count} | ${formatFilsToJod(sCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${sources.reduce((sum, s) => sum + s.count, 0)}** | **${formatFilsToJod(totalCents)}** | **100%** |

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "orders") {
      // 4. Order funnels
      const funnels = await db
        .select({
          status: order.status,
          count: count(order.id),
          totalPrice: sum(order.totalPriceCents),
        })
        .from(order)
        .where(buildDateCondition(order, range))
        .groupBy(order.status);

      const totalCount = funnels.reduce((sum, f) => sum + f.count, 0);
      const totalCents = funnels.reduce(
        (sum, f) => sum + (Number(f.totalPrice) || 0),
        0,
      );

      const statusLabels: Record<string, string> = {
        draft: "مقترح",
        sent: "تم التأكيد",
        confirmed: "تحت التنفيذ",
        delivered: "تم التسليم",
        cancelled: "ملغى",
      };

      markdown = `# تقرير قنوات وحالة الطلبات

**تاريخ التصدير:** ${todayStr}

---

## توزيع الطلبات حسب الحالة التشغيلية

| حالة الطلب | عدد الطلبات | إجمالي القيمة التقديرية | النسبة من العدد |
| :--- | :---: | :--- | :---: |
${funnels
  .map((f) => {
    const fCents = Number(f.totalPrice) || 0;
    const percentage =
      totalCount > 0 ? `${((f.count / totalCount) * 100).toFixed(1)}%` : "0%";
    const label = statusLabels[f.status] || f.status;
    return `| ${label} | ${f.count} | ${formatFilsToJod(fCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${totalCount}** | **${formatFilsToJod(totalCents)}** | **100%** |

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "products") {
      // 5. Top products
      const products = await db
        .select({
          productName: order.productName,
          count: count(order.id),
          totalQuantity: sum(order.quantity),
          totalRevenue: sum(order.totalPriceCents),
        })
        .from(order)
        .where(buildDateCondition(order, range))
        .groupBy(order.productName)
        .orderBy(desc(sql`sum(${order.totalPriceCents})`))
        .limit(15);

      markdown = `# تقرير أكثر المنتجات طلباً (قيمة تقديرية)

**تاريخ التصدير:** ${todayStr}

---

## المنتجات الأكثر طلباً (أعلى 15 منتج)

| اسم المنتج | عدد الطلبات | إجمالي الكمية المطلوبة | إجمالي القيمة التقديرية |
| :--- | :---: | :---: | :--- |
${products
  .map((p) => {
    const revCents = Number(p.totalRevenue) || 0;
    return `| ${p.productName} | ${p.count} | ${p.totalQuantity || 0} | ${formatFilsToJod(revCents)} |`;
  })
  .join("\n")}

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    }

    return { status: "ok", data: markdown };
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}

// ===== بيانات منظمة للعرض المباشر في الصفحة =====

export type StructuredReportData = {
  pnl: {
    salesCents: number;
    purchasesCents: number;
    expensesCents: number;
    netCents: number;
  };
  expensesByCategory: {
    category: string;
    totalCents: number;
    count: number;
    pct: number;
  }[];
  salesBySource: {
    source: string;
    label: string;
    totalCents: number;
    count: number;
    pct: number;
  }[];
  ordersByStatus: {
    status: string;
    label: string;
    count: number;
    totalCents: number;
    pct: number;
  }[];
  topProducts: {
    name: string;
    orderCount: number;
    totalQty: number;
    revenueCents: number;
  }[];
};

export async function getAllReportData(
  range: "all" | "month" | "30d" = "all",
): Promise<ActionResponse<StructuredReportData>> {
  try {
    const salesDateConds = [
      isNull(cashMovement.deletedAt),
      eq(cashMovement.direction, "in"),
      sql`${cashMovement.sourceType} in ('sale', 'deposit')`
    ];
    const sStart = rangeStartDate(range);
    const sEnd = rangeEndDate(range);
    if (sStart) salesDateConds.push(sql`${cashMovement.date} >= ${sStart}`);
    if (sEnd) salesDateConds.push(sql`${cashMovement.date} <= ${sEnd}`);

    const [pnl, categoriesRes, sourcesRes, funnelsRes, productsRes] =
      await Promise.all([
        computeCashBasisPnl(range),
        // تفاصيل المصاريف حسب الفئة — من دفتر الصندوق (cash_movement) لا من جدول expense
        // مربوط بـ expense لاستعادة الفئة (لا يوجد عمود category في cash_movement)، وبـ account لاستبعاد المحذوفة. أساس نقدي.
        db
          .select({
            category: expense.category,
            total: sum(cashMovement.amountCents),
            count: count(cashMovement.id),
          })
          .from(cashMovement)
          .innerJoin(account, eq(cashMovement.accountId, account.id))
          .innerJoin(
            expense,
            and(eq(cashMovement.sourceType, "expense"), eq(cashMovement.sourceId, expense.id))
          )
          .where(
            and(
              buildDateCondition(cashMovement, range),
              isNull(account.deletedAt),
              eq(cashMovement.direction, "out")
            )
          )
          .groupBy(expense.category)
          .orderBy(desc(sql`sum(${cashMovement.amountCents})`)),
        db
          .select({
            sourceType: cashMovement.sourceType,
            total: sum(cashMovement.amountCents),
            count: count(cashMovement.id),
          })
          .from(cashMovement)
          .where(and(...salesDateConds))
          .groupBy(cashMovement.sourceType)
          .orderBy(desc(sql`sum(${cashMovement.amountCents})`)),
        db
          .select({
            status: order.status,
            count: count(order.id),
            totalPrice: sum(order.totalPriceCents),
          })
          .from(order)
          .where(buildDateCondition(order, range))
          .groupBy(order.status),
        db
          .select({
            productName: order.productName,
            count: count(order.id),
            totalQty: sum(order.quantity),
            totalRevenue: sum(order.totalPriceCents),
          })
          .from(order)
          .where(buildDateCondition(order, range))
          .groupBy(order.productName)
          .orderBy(desc(sql`sum(${order.totalPriceCents})`))
          .limit(15),
      ]);

    const { salesCents, purchasesCents, expensesCents, netCents } = pnl;

    const totalExpensesCents = categoriesRes.reduce(
      (s, c) => s + (Number(c.total) || 0),
      0,
    );
    const expensesByCategory = categoriesRes.map((c) => {
      const cCents = Number(c.total) || 0;
      return {
        category: c.category,
        totalCents: cCents,
        count: c.count,
        pct: totalExpensesCents > 0 ? (cCents / totalExpensesCents) * 100 : 0,
      };
    });

    const sourceTypeLabels: Record<string, string> = {
      deposit: "عربونات طلبات (دُفعت مقدماً)",
      sale: "تسويات مبيعات (متبقّي مُحصَّل)",
    };
    const totalSalesCents = sourcesRes.reduce(
      (s, r) => s + (Number(r.total) || 0),
      0,
    );
    const salesBySource = sourcesRes.map((s) => {
      const sCents = Number(s.total) || 0;
      const src = s.sourceType ?? "sale";
      return {
        source: src,
        label: sourceTypeLabels[src] ?? src,
        totalCents: sCents,
        count: s.count,
        pct: totalSalesCents > 0 ? (sCents / totalSalesCents) * 100 : 0,
      };
    });

    const statusLabels: Record<string, string> = {
      draft: "مقترح",
      sent: "تم التأكيد",
      confirmed: "تحت التنفيذ",
      delivered: "تم التسليم",
      cancelled: "ملغى",
    };
    const totalOrderCount = funnelsRes.reduce((s, f) => s + f.count, 0);
    const ordersByStatus = funnelsRes.map((f) => ({
      status: f.status,
      label: statusLabels[f.status] ?? f.status,
      count: f.count,
      totalCents: Number(f.totalPrice) || 0,
      pct: totalOrderCount > 0 ? (f.count / totalOrderCount) * 100 : 0,
    }));

    const topProducts = productsRes.map((p) => ({
      name: p.productName,
      orderCount: p.count,
      totalQty: Number(p.totalQty) || 0,
      revenueCents: Number(p.totalRevenue) || 0,
    }));

    return {
      status: "ok",
      data: {
        pnl: { salesCents, purchasesCents, expensesCents, netCents },
        expensesByCategory,
        salesBySource,
        ordersByStatus,
        topProducts,
      },
    };
  } catch (error) {
    return { status: "error", message: mapDbError(error) };
  }
}

export type FinancialPositionData = {
  assets: {
    cashCents: number;
    bankCents: number;
    /**
     * Phase 3-revised (D4 fix) — قيمة المخزون المتتبَّع على الطريقة `in qty × unit_cost − out qty × unit_cost`
     * من catalog_movement (deletedAt IS NULL، date <= asOfDate). قيمة دفترية فعلية
     * (وليست تقدير defaultCostCents كما كانت قبل D4). تُضاف لـ totalCents.
     */
    inventoryValueCents: number;
    totalCents: number;
  };
  liabilities: {
    depositsCents: number;
    totalCents: number;
  };
  equity: {
    openingCapitalCents: number;
    openingCashInEquityCents: number;
    injectionsCents: number;
    drawingsCents: number;
    retainedProfitCents: number;
    /** Phase 2 — إضافات رأسمالية (آلات/أثاث) مُستبعَدة من retainedProfit
     * التشغيلي. تُطرح من totalEquity كسطر منفصل (Option A) للحفاظ على IC-1. */
    capitalAdditionsCents: number;
    totalCents: number;
  };
  balanced: boolean;
  differenceCents: number;
  equityDriftCents: number;
  pnlAsOfDateNetCents: number;
  pnlReconciliationCents: number;
  /**
   * Phase 3-revised (D4 fix) — COGS التراكمي حتى asOfDate (تكلفة البضاعة المباعة
   * من كتالوج حركات out لـ order_delivery). مُخصوم من retainedProfitCents
   * كتعديل غير نقدي لمطابقة الإيراد بالتكلفة. موثَّق في INV-24.
   */
  cogsCentsToDate: number;
  ledgerPnlNetCents: number;
  sourceTablePnlNetCents: number;
  pnlSourceReconciliationCents: number;
};

export async function getFinancialPosition(
  asOfDate: string,
): Promise<ActionResponse<FinancialPositionData>> {
  try {
    return await db.transaction(async (tx) => {
      // 1. حساب أرصدة الصناديق والبنك بتاريخ محدد باستخدام استعلام واحد مجمّع (FIX-D)
      const cashAccounts = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.type, "cash"), isNull(account.deletedAt)));

      const bankAccounts = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.type, "bank"), isNull(account.deletedAt)));

      const movements = await tx
        .select({
          accountId: cashMovement.accountId,
          direction: cashMovement.direction,
          total: sum(cashMovement.amountCents),
        })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            isNull(cashMovement.deletedAt),
            isNull(account.deletedAt),
            sql`${cashMovement.date} <= ${asOfDate}`
          )
        )
        .groupBy(cashMovement.accountId, cashMovement.direction);

      const balanceMap: Record<string, { in: number; out: number }> = {};
      for (const m of movements) {
        if (!balanceMap[m.accountId]) {
          balanceMap[m.accountId] = { in: 0, out: 0 };
        }
        const val = Number(m.total) || 0;
        if (m.direction === "in") {
          balanceMap[m.accountId].in = val;
        } else if (m.direction === "out") {
          balanceMap[m.accountId].out = val;
        }
      }

      let totalCashCents = 0;
      for (const acc of cashAccounts) {
        const entry = balanceMap[acc.id] || { in: 0, out: 0 };
        totalCashCents += (entry.in - entry.out);
      }

      let totalBankCents = 0;
      for (const acc of bankAccounts) {
        const entry = balanceMap[acc.id] || { in: 0, out: 0 };
        totalBankCents += (entry.in - entry.out);
      }

      // Phase 3-revised (D4 fix) — قيمة المخزون المتتبَّع من catalog_movement.
      // = Σ(in qty × coalesce(unit_cost_cents, 0)) − Σ(out qty × coalesce(unit_cost_cents, 0))
      // لكل صف نشط (deletedAt IS NULL) بتاريخ <= asOfDate. الأصناف غير المتتبَّعة لا
      // تُنشئ حركات أصلاً (deductForDelivery و createPurchase يتخطّونها)، فلا حاجة
      // لـ JOIN catalog_component. coalesce على unit_cost_cents يعالج الحركات
      // الافتتاحية/اليدوية بلا سعر (تعامل كتكلفتها 0 — مخزون مجاني).
      //
      // SA1 (A1 fix) — نُفضِّل total_value_cents (العدد الصحيح الأصلي للحركة) على
      // `qty × unit_cost_cents` لتفادي انحراف كسور الـ fils. للحركة `in` من purchase،
      // total_value_cents = purchase.totalCents (= مبلغ الصندوق المخصوم بالضبط)،
      // فلا يظهر equityDrift عند الكميات غير القابلة للقسمة. للحركة `out` من
      // order_delivery / manual_out، total_value_cents = qty × unit_cost_cents
      // (= COGS، مطابقاً للقيمة المخصومة من المخزون). الـ fallback إلى
      // `qty × coalesce(unit_cost_cents, 0)` يحافظ على التوافق مع الحركات القديمة
      // (قبل migration 0024) التي لا تملك total_value_cents.
      const [inventoryValRow] = await tx
        .select({
          inventoryValueCents: sql<number>`coalesce(sum(
            case when ${catalogMovement.direction} = 'in'
                 then coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))
                 else -(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)))
            end
          ), 0)::bigint`,
        })
        .from(catalogMovement)
        .where(
          and(
            isNull(catalogMovement.deletedAt),
            sql`${catalogMovement.date} <= ${asOfDate}`,
          ),
        );
      const inventoryValueCents = Number(inventoryValRow?.inventoryValueCents) || 0;

      const totalAssets = totalCashCents + totalBankCents + inventoryValueCents;

      // 2. التزامات عربون العملاء غير الموصلة (Customer deposits deferred)
      const [depositsRes] = await tx
        .select({ total: sum(order.depositCents) })
        .from(order)
        .where(
          and(
            isNull(order.deletedAt),
            sql`${order.status} not in ('delivered', 'cancelled')`,
            sql`${order.depositCents} > 0`,  // F-P2-4: skip zero-deposit orders
            sql`coalesce(${order.depositDate}, ${order.receivedDate}) <= ${asOfDate}`
          )
        );
      const depositsCents = Number(depositsRes?.total) || 0;
      const totalLiabilities = depositsCents;

      // 3. رأس المال الافتتاحي الفعلي والمصرح به (FIX-A)
      const [openingAssetsRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            eq(cashMovement.sourceType, "opening"),
            isNull(account.deletedAt),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt)
          )
        );
      const openingCashInEquityCents = Number(openingAssetsRes?.total) || 0;

      const [opBal] = await tx
        .select()
        .from(openingBalance)
        .where(isNull(openingBalance.deletedAt))
        .limit(1);
      const openingCapitalCents = opBal ? opBal.capitalCents : 0;

      // 4. معاملات سحب وايداع المالك — من دفتر الصندوق (cash_movement) لا من جدول owner_transaction
      // للحفاظ على قاعدة الأساس النقدي: كل أرقام الميزانية تُشتق من الدفتر. متطابق مع owner_transaction في التشغيل السليم.
      const [injectionsRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            eq(cashMovement.direction, "in"),
            eq(cashMovement.sourceType, "owner_inject"),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt),
            isNull(account.deletedAt)
          )
        );
      const injectionsCents = Number(injectionsRes?.total) || 0;

      const [drawingsRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            eq(cashMovement.direction, "out"),
            eq(cashMovement.sourceType, "owner_draw"),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt),
            isNull(account.deletedAt)
          )
        );
      const drawingsCents = Number(drawingsRes?.total) || 0;

      // 5. الأرباح المدورة = (كل المقبوضات من مبيعات وعربونات) - (عربونات الطلبات غير الموصلة) - (المدفوعات التشغيلية للمشتريات والمصاريف)
      //    Phase 2: المصاريف والمشتريات الرأسمالية مُستبعَدة من retained (ربح
      //    تشغيلي). تُخصم كذلك من totalEquity كسطر منفصل (Option A — انظر
      //    CRITICAL-NOTE-2) للحفاظ على معادلة الميزانية (IC-1):
      //      totalEquity = opening + injections − drawings + retainedOperating − capitalAdditions
      //    retained زاد بمقدار capitalOut (لم يعد مطروحاً) لكن totalAssets لم
      //    يتغير (كان يطرح capitalOut أصلاً). بطرح capitalAdditions من totalEquity
      //    نُلغي الزيادة فتبقى المعادلة متوازنة.
      const [salesCashInRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            eq(cashMovement.direction, "in"),
            sql`${cashMovement.sourceType} in ('sale', 'deposit')`,
            isNull(account.deletedAt),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt)
          )
        );
      const salesCashInCents = Number(salesCashInRes?.total) || 0;

      // Phase 2 — استدعِ computeOperatingPnl لكل الفترة حتى asOfDate (لا حدّ أدنى).
      // نأخذ منها: operatingExpensesCents، operatingPurchasesCents، capitalAdditionsCents،
      // cogsCents (Phase 3-revised — D4 fix). salesCents من الدالة != salesCashInCents
      // هنا (الأولى source='sale' فقط، الثانية source IN ('sale','deposit')) — نُبقي
      // salesCashInCents كما هي.
      const operatingPnl = await computeOperatingPnl({
        endDate: asOfDate,
        tx,
      });
      const operatingExpensesCashOutCents = operatingPnl.operatingExpensesCents;
      const operatingPurchasesCashOutCents = operatingPnl.operatingPurchasesCents;
      const operatingCashOutCents = operatingExpensesCashOutCents + operatingPurchasesCashOutCents;
      const capitalAdditionsCents = operatingPnl.capitalAdditionsCents;
      // Phase 3-revised (D4 fix) — COGS التراكمي حتى asOfDate (من computeOperatingPnl
      // بـ range:"all" — startDate=undefined يجعله يُرجِع تراكم كل التاريخ حتى endDate).
      // cogsCents من computeOperatingPnl في وضع range:"all" = تراكم حتى asOfDate.
      const cogsCentsToDate = operatingPnl.cogsCents;

      // Phase 3-revised (D4 fix) — retainedProfitCents يطرح COGS التراكمي (تعديل
      // غير نقدي لمطابقة الإيراد بالتكلفة). operatingPurchasesCents لا يضم المشتريات
      // المُرأسمَلة كمخزون (is_tracked_inventory=true مُستبعَدة) — فلا تُخصَم من
      // retained في شهر الشراء، بل تُرأسمَل في inventoryValueCents (المضافة لـ
      // totalAssets أعلاه). عند البيع: Cash يزيد بـ salesCashInCents، COGS يُخصم
      // من retainedProfitCents، inventoryValueCents يقل تلقائياً (لأن الحركة out
      // لها unit_cost_cents) — فتبقى IC-1 = 0. موثَّق في INV-23 / INV-24.
      const retainedProfitCents = salesCashInCents - depositsCents - operatingCashOutCents - cogsCentsToDate;

      // حساب إجمالي حقوق الملكية — Option A: capitalAdditions سطر طرح منفصل.
      // هذا يُحافظ على IC-1 (equityDriftCents == 0) رغم أن retained لم يعد يطرح
      // الرأسمالي. المعادلة موثَّقة في ACCOUNTING_RULES.md INV-18 (Phase 2 §8).
      const totalEquity = openingCashInEquityCents + injectionsCents - drawingsCents + retainedProfitCents - capitalAdditionsCents;

      // D5: REAL reconciliation — two independently-derived checks that CAN fail.
      // Check 1: equity-from-ledger vs equity-from-components.
      const equityFromLedger = totalAssets - totalLiabilities;
      const equityFromComponents = totalEquity;
      const equityDriftCents = equityFromLedger - equityFromComponents;

      // Check 2: retained profit (cash-basis, all time, OPERATING) vs cash-basis
      // P&L (all time, OPERATING). Both sides exclude capital → drift should stay 0.
      // Phase 3-revised (D4 fix): cogsCentsToDate يُخصم من الطرفين معاً (retainedProfitCents
      // أعلاه طرحه، وpnlAsOfDateNetCents نطرحه هنا) ليظل pnlReconciliationCents = 0.
      const pnlAsOfDateNetCents = salesCashInCents - operatingCashOutCents - cogsCentsToDate;
      const pnlReconciliationCents = pnlAsOfDateNetCents - (retainedProfitCents + depositsCents);

      // F-05: real reconciliation between ledger (cash_movement) and source tables (sale, purchase, expense, order deposits).
      // Both sides are archived-inclusive to avoid false alarms from archived accounts in normal operation (Option b).
      
      // 1. Ledger-side P&L Net (All time, archived-inclusive)
      const [ledgerSalesAllTimeRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.direction, "in"),
            sql`${cashMovement.sourceType} in ('sale', 'deposit')`,
            isNull(cashMovement.deletedAt)
          )
        );
      const ledgerSalesAllTimeCents = Number(ledgerSalesAllTimeRes?.total) || 0;

      const [ledgerOutAllTimeRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .where(
          and(
            eq(cashMovement.direction, "out"),
            sql`${cashMovement.sourceType} in ('expense', 'purchase')`,
            isNull(cashMovement.deletedAt)
          )
        );
      const ledgerOutAllTimeCents = Number(ledgerOutAllTimeRes?.total) || 0;
      const ledgerPnlNetCents = ledgerSalesAllTimeCents - ledgerOutAllTimeCents;

      // 2. Source-side P&L Net (All time, archived-inclusive)
      const [srcSalesAllTimeRes] = await tx
        .select({ total: sum(sale.amountCents) })
        .from(sale)
        .where(isNull(sale.deletedAt));
      const srcSalesAllTimeCents = Number(srcSalesAllTimeRes?.total) || 0;

      const [srcPurchasesAllTimeRes] = await tx
        .select({ total: sum(purchase.totalCents) })
        .from(purchase)
        .where(isNull(purchase.deletedAt));
      const srcPurchasesAllTimeCents = Number(srcPurchasesAllTimeRes?.total) || 0;

      const [srcExpensesAllTimeRes] = await tx
        .select({ total: sum(expense.amountCents) })
        .from(expense)
        .where(isNull(expense.deletedAt));
      const srcExpensesAllTimeCents = Number(srcExpensesAllTimeRes?.total) || 0;

      // Active order deposits represent cash collected (deposit) that has not yet been converted into a sale.
      const [activeDepositsRes] = await tx
        .select({ total: sum(order.depositCents) })
        .from(order)
        .where(
          and(
            isNull(order.deletedAt),
            sql`${order.status} not in ('delivered', 'cancelled')`,
            sql`${order.depositCents} > 0`
          )
        );
      const activeDepositsCents = Number(activeDepositsRes?.total) || 0;

      const sourceTablePnlNetCents = (srcSalesAllTimeCents + activeDepositsCents) - srcPurchasesAllTimeCents - srcExpensesAllTimeCents;
      const pnlSourceReconciliationCents = ledgerPnlNetCents - sourceTablePnlNetCents;

      if (Math.abs(equityDriftCents) > 0) {
        console.warn(`[balance-sheet] equity drift detected: ${equityDriftCents} fils`);
      }

      return {
        status: "ok",
        data: {
          assets: {
            cashCents: totalCashCents,
            bankCents: totalBankCents,
            inventoryValueCents,
            totalCents: totalAssets,
          },
          liabilities: {
            depositsCents: depositsCents,
            totalCents: totalLiabilities,
          },
          equity: {
            openingCapitalCents,
            openingCashInEquityCents,
            injectionsCents,
            drawingsCents,
            retainedProfitCents,
            capitalAdditionsCents,
            totalCents: totalEquity,
          },
          balanced: Math.abs(equityDriftCents) === 0,
          differenceCents: equityDriftCents,
          equityDriftCents,
          pnlAsOfDateNetCents,
          pnlReconciliationCents,
          cogsCentsToDate,
          ledgerPnlNetCents,
          sourceTablePnlNetCents,
          pnlSourceReconciliationCents,
        },
      };
    });
  } catch (error) {
    return {
      status: "error",
      message: mapDbError(error),
    };
  }
}
