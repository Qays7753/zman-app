"use server";

import { count, desc, isNull, sql, sum, gte, and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { ActionResponse } from "../finance/actions";
import { expense, purchase, sale, account, cashMovement, ownerTransaction, openingBalance } from "../finance/db";
import { order } from "../orders/db";
import { mapDbError } from "@/lib/db/errors";

import { formatFilsToJod } from "@/lib/money";

function rangeStartDate(range?: "all" | "month" | "30d"): string | null {
  if (range === "month") {
    const ammanToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
    const [year, month] = ammanToday.split("-");
    return `${year}-${month}-01`;
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
    const ammanToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
    const [year, month] = ammanToday.split("-");
    const lastDayNum = new Date(Number(year), Number(month), 0).getDate();
    return `${year}-${month}-${String(lastDayNum).padStart(2, "0")}`;
  }
  if (range === "30d") {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
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
  const baseConds = [isNull(cashMovement.deletedAt)];
  const sStart = rangeStartDate(range);
  const sEnd = rangeEndDate(range);
  if (sStart) baseConds.push(sql`${cashMovement.date} >= ${sStart}`);
  if (sEnd) baseConds.push(sql`${cashMovement.date} <= ${sEnd}`);

  const [[salesRes], [purchasesRes], [expensesRes]] = await Promise.all([
    tx
      .select({ total: sum(cashMovement.amountCents) })
      .from(cashMovement)
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "in"),
          sql`${cashMovement.sourceType} in ('sale', 'deposit')`
        )
      ),
    tx
      .select({ total: sum(cashMovement.amountCents) })
      .from(cashMovement)
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "purchase")
        )
      ),
    tx
      .select({ total: sum(cashMovement.amountCents) })
      .from(cashMovement)
      .where(
        and(
          ...baseConds,
          eq(cashMovement.direction, "out"),
          eq(cashMovement.sourceType, "expense")
        )
      ),
  ]);

  const salesCents = Number(salesRes?.total) || 0;
  const purchasesCents = Number(purchasesRes?.total) || 0;
  const expensesCents = Number(expensesRes?.total) || 0;
  const netCents = salesCents - purchasesCents - expensesCents;

  return { salesCents, purchasesCents, expensesCents, netCents };
}

export async function downloadReport(
  type: "pnl" | "expenses" | "sales" | "orders" | "products",
  range: "all" | "month" | "30d" = "all",
): Promise<ActionResponse<string>> {
  try {
    const todayStr = new Date().toLocaleDateString("ar-JO", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let markdown = "";

    if (type === "pnl") {
      // 1. P&L Report
      const { salesCents, purchasesCents, expensesCents, netCents } = await computeCashBasisPnl(range);

      markdown = `# تقرير الأرباح والخسائر (P&L)

**تاريخ التصدير:** ${todayStr}

---

## ملخص مالي عام

| البند المالي | القيمة الإجمالية | التفاصيل |
| :--- | :--- | :--- |
| **إجمالي المبيعات (الإيرادات)** | ${formatFilsToJod(salesCents)} | مجموع المدفوعات المستلمة من الزبائن |
| **إجمالي المشتريات (المواد)** | ${formatFilsToJod(purchasesCents)} | تكاليف الخامات والمشتريات التشغيلية للورشة |
| **إجمالي المصاريف (العمومية)** | ${formatFilsToJod(expensesCents)} | المصاريف التشغيلية، الإيجارات، الفواتير، والرواتب |
| **صافي الأرباح / الخسائر** | **${formatFilsToJod(netCents)}** | **الأرباح الصافية المحتسبة بعد خصم كافة التكاليف** |

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "expenses") {
      // 2. Expense categories
      const categories = await db
        .select({
          category: expense.category,
          total: sum(expense.amountCents),
          count: count(expense.id),
        })
        .from(expense)
        .where(buildDateCondition(expense, range))
        .groupBy(expense.category)
        .orderBy(desc(sql`sum(${expense.amountCents})`));

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
    totalCents: number;
  };
  balanced: boolean;
  differenceCents: number;
  equityDriftCents: number;
  pnlAllTimeNetCents: number;
  pnlReconciliationCents: number;
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

      const totalAssets = totalCashCents + totalBankCents;

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

      // 5. الأرباح المدورة = (كل المقبوضات من مبيعات وعربونات) - (عربونات الطلبات غير الموصلة) - (المدفوعات للمشتريات والمصاريف)
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

      const [expensesPurchasesCashOutRes] = await tx
        .select({ total: sum(cashMovement.amountCents) })
        .from(cashMovement)
        .innerJoin(account, eq(cashMovement.accountId, account.id))
        .where(
          and(
            eq(cashMovement.direction, "out"),
            sql`${cashMovement.sourceType} in ('expense', 'purchase')`,
            isNull(account.deletedAt),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt)
          )
        );
      const expensesPurchasesCashOutCents = Number(expensesPurchasesCashOutRes?.total) || 0;

      const retainedProfitCents = salesCashInCents - depositsCents - expensesPurchasesCashOutCents;

      // حساب إجمالي حقوق الملكية بناء على نقدية البداية الفعلية بدلاً من رأس المال الافتتاحي المصرح به لضمان توازن الميزانية دائماً
      const totalEquity = openingCashInEquityCents + injectionsCents - drawingsCents + retainedProfitCents;

      // D5: REAL reconciliation — two independently-derived checks that CAN fail.
      // Check 1: equity-from-ledger vs equity-from-components.
      const equityFromLedger = totalAssets - totalLiabilities;
      const equityFromComponents = totalEquity;
      const equityDriftCents = equityFromLedger - equityFromComponents;

      // Check 2: retained profit (cash-basis, all time) vs cash-basis P&L (all time).
      const pnlAllTimeNetCents = salesCashInCents - expensesPurchasesCashOutCents;
      const pnlReconciliationCents = pnlAllTimeNetCents - (retainedProfitCents + depositsCents);

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
            totalCents: totalEquity,
          },
          balanced: Math.abs(equityDriftCents) === 0,
          differenceCents: equityDriftCents,
          equityDriftCents,
          pnlAllTimeNetCents,
          pnlReconciliationCents,
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
