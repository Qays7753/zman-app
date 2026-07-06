"use server";

import { count, desc, isNull, sql, sum, gte, and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { ActionResponse } from "../finance/actions";
import { expense, purchase, sale, account, cashMovement, ownerTransaction, openingBalance } from "../finance/db";
import { order } from "../orders/db";
import { mapDbError } from "@/lib/db/errors";

function formatJOD(cents: number): string {
  const jod = cents / 1000;
  return `${jod.toLocaleString("en-JO", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })} د.أ`;
}

function buildDateCondition(table: any, range?: "all" | "month" | "30d") {
  const conditions = [isNull(table.deletedAt)];
  const dateField = table.receivedDate ?? table.date;

  if (range === "month") {
    const ammanToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
    const [year, month] = ammanToday.split("-");
    const start = `${year}-${month}-01`;
    const lastDayNum = new Date(Number(year), Number(month), 0).getDate();
    const end = `${year}-${month}-${String(lastDayNum).padStart(2, "0")}`;

    conditions.push(sql`${dateField} >= ${start}`);
    conditions.push(sql`${dateField} <= ${end}`);
  } else if (range === "30d") {
    const now = new Date();
    const startOf30Days = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const start = startOf30Days.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
    const end = now.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });

    conditions.push(sql`${dateField} >= ${start}`);
    conditions.push(sql`${dateField} <= ${end}`);
  }
  return and(...conditions);
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
      const [[salesRes], [purchasesRes], [expensesRes]] = await Promise.all([
        db
          .select({ total: sum(sale.amountCents) })
          .from(sale)
          .where(buildDateCondition(sale, range)),
        db
          .select({ total: sum(purchase.totalCents) })
          .from(purchase)
          .where(buildDateCondition(purchase, range)),
        db
          .select({ total: sum(expense.amountCents) })
          .from(expense)
          .where(buildDateCondition(expense, range)),
      ]);

      const salesCents = Number(salesRes?.total) || 0;
      const purchasesCents = Number(purchasesRes?.total) || 0;
      const expensesCents = Number(expensesRes?.total) || 0;
      const netCents = salesCents - purchasesCents - expensesCents;

      markdown = `# تقرير الأرباح والخسائر (P&L)

**تاريخ التصدير:** ${todayStr}

---

## ملخص مالي عام

| البند المالي | القيمة الإجمالية | التفاصيل |
| :--- | :--- | :--- |
| **إجمالي المبيعات (الإيرادات)** | ${formatJOD(salesCents)} | مجموع المدفوعات المستلمة من الزبائن |
| **إجمالي المشتريات (المواد)** | ${formatJOD(purchasesCents)} | تكاليف الخامات والمشتريات التشغيلية للورشة |
| **إجمالي المصاريف (العمومية)** | ${formatJOD(expensesCents)} | المصاريف التشغيلية، الإيجارات، الفواتير، والرواتب |
| **صافي الأرباح / الخسائر** | **${formatJOD(netCents)}** | **الأرباح الصافية المحتسبة بعد خصم كافة التكاليف** |

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
    return `| ${c.category} | ${c.count} | ${formatJOD(cCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${categories.reduce((s, c) => s + c.count, 0)}** | **${formatJOD(totalCents)}** | **100%** |

---
*تم إنشاء هذا التقرير تلقائياً بواسطة نظام Zman الداخلي لإدارة الورش والمخازن.*
`;
    } else if (type === "sales") {
      // 3. Sales sources
      const sources = await db
        .select({
          source: sale.source,
          total: sum(sale.amountCents),
          count: count(sale.id),
        })
        .from(sale)
        .where(buildDateCondition(sale, range))
        .groupBy(sale.source)
        .orderBy(desc(sql`sum(${sale.amountCents})`));

      const totalCents = sources.reduce(
        (sum, s) => sum + (Number(s.total) || 0),
        0,
      );

      const sourceLabels: Record<string, string> = {
        manual: "إدخال يدوي مباشر",
        order: "مبيعات مرتبطة بطلب معتمد",
      };

      markdown = `# تقرير مصادر المبيعات والإيرادات

**تاريخ التصدير:** ${todayStr}

---

## تفصيل الإيرادات حسب القناة والمصدر

| مصدر المبيعات | عدد العمليات | إجمالي الإيرادات | النسبة المئوية |
| :--- | :---: | :--- | :---: |
${sources
  .map((s) => {
    const sCents = Number(s.total) || 0;
    const percentage =
      totalCents > 0 ? `${((sCents / totalCents) * 100).toFixed(1)}%` : "0%";
    const label = sourceLabels[s.source] || s.source;
    return `| ${label} | ${s.count} | ${formatJOD(sCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${sources.reduce((sum, s) => sum + s.count, 0)}** | **${formatJOD(totalCents)}** | **100%** |

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
        draft: "مسودة",
        sent: "تم الإرسال",
        confirmed: "مؤكد",
        delivered: "تم التوصيل",
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
    return `| ${label} | ${f.count} | ${formatJOD(fCents)} | ${percentage} |`;
  })
  .join("\n")}
| **المجموع الكلي** | **${totalCount}** | **${formatJOD(totalCents)}** | **100%** |

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

      markdown = `# تقرير أكثر المنتجات طلباً وتحقيقاً للإيرادات

**تاريخ التصدير:** ${todayStr}

---

## المنتجات الأكثر مبيعاً (أعلى 15 منتج)

| اسم المنتج | عدد الطلبات | إجمالي الكمية المباعة | إجمالي الإيرادات المحققة |
| :--- | :---: | :---: | :--- |
${products
  .map((p) => {
    const revCents = Number(p.totalRevenue) || 0;
    return `| ${p.productName} | ${p.count} | ${p.totalQuantity || 0} | ${formatJOD(revCents)} |`;
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
    const [salesRes, purchasesRes, expensesRes, categoriesRes, sourcesRes, funnelsRes, productsRes] =
      await Promise.all([
        db.select({ total: sum(sale.amountCents) }).from(sale).where(buildDateCondition(sale, range)),
        db.select({ total: sum(purchase.totalCents) }).from(purchase).where(buildDateCondition(purchase, range)),
        db.select({ total: sum(expense.amountCents) }).from(expense).where(buildDateCondition(expense, range)),
        db
          .select({
            category: expense.category,
            total: sum(expense.amountCents),
            count: count(expense.id),
          })
          .from(expense)
          .where(buildDateCondition(expense, range))
          .groupBy(expense.category)
          .orderBy(desc(sql`sum(${expense.amountCents})`)),
        db
          .select({
            source: sale.source,
            total: sum(sale.amountCents),
            count: count(sale.id),
          })
          .from(sale)
          .where(buildDateCondition(sale, range))
          .groupBy(sale.source)
          .orderBy(desc(sql`sum(${sale.amountCents})`)),
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

    const salesCents = Number(salesRes[0]?.total) || 0;
    const purchasesCents = Number(purchasesRes[0]?.total) || 0;
    const expensesCents = Number(expensesRes[0]?.total) || 0;
    const netCents = salesCents - purchasesCents - expensesCents;

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

    const sourceLabels: Record<string, string> = {
      manual: "إدخال يدوي مباشر",
      order: "مبيعات مرتبطة بطلب",
    };
    const totalSalesCents = sourcesRes.reduce(
      (s, r) => s + (Number(r.total) || 0),
      0,
    );
    const salesBySource = sourcesRes.map((s) => {
      const sCents = Number(s.total) || 0;
      return {
        source: s.source,
        label: sourceLabels[s.source] ?? s.source,
        totalCents: sCents,
        count: s.count,
        pct: totalSalesCents > 0 ? (sCents / totalSalesCents) * 100 : 0,
      };
    });

    const statusLabels: Record<string, string> = {
      draft: "مسودة",
      sent: "تم الإرسال",
      confirmed: "مؤكد",
      delivered: "تم التوصيل",
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
        .where(and(eq(account.type, "cash"), eq(account.isArchived, false), isNull(account.deletedAt)));

      const bankAccounts = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.type, "bank"), eq(account.isArchived, false), isNull(account.deletedAt)));

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
            eq(account.isArchived, false),
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
            eq(account.isArchived, false),
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

      // 4. معاملات سحب وايداع المالك
      const [injectionsRes] = await tx
        .select({ total: sum(ownerTransaction.amountCents) })
        .from(ownerTransaction)
        .innerJoin(account, eq(ownerTransaction.accountId, account.id))
        .where(
          and(
            eq(ownerTransaction.type, "inject"),
            sql`${ownerTransaction.date} <= ${asOfDate}`,
            isNull(ownerTransaction.deletedAt),
            isNull(account.deletedAt),
            eq(account.isArchived, false)
          )
        );
      const injectionsCents = Number(injectionsRes?.total) || 0;

      const [drawingsRes] = await tx
        .select({ total: sum(ownerTransaction.amountCents) })
        .from(ownerTransaction)
        .innerJoin(account, eq(ownerTransaction.accountId, account.id))
        .where(
          and(
            eq(ownerTransaction.type, "draw"),
            sql`${ownerTransaction.date} <= ${asOfDate}`,
            isNull(ownerTransaction.deletedAt),
            isNull(account.deletedAt),
            eq(account.isArchived, false)
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
            eq(account.isArchived, false),
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
            eq(account.isArchived, false),
            sql`${cashMovement.date} <= ${asOfDate}`,
            isNull(cashMovement.deletedAt)
          )
        );
      const expensesPurchasesCashOutCents = Number(expensesPurchasesCashOutRes?.total) || 0;

      const retainedProfitCents = salesCashInCents - depositsCents - expensesPurchasesCashOutCents;

      // حساب إجمالي حقوق الملكية بناء على نقدية البداية الفعلية بدلاً من رأس المال الافتتاحي المصرح به لضمان توازن الميزانية دائماً
      const totalEquity = openingCashInEquityCents + injectionsCents - drawingsCents + retainedProfitCents;

      const differenceCents = totalAssets - (totalLiabilities + totalEquity);
      const balanced = Math.abs(differenceCents) === 0;

      if (!balanced) {
        return {
          status: "error",
          message: `الميزانية غير متوازنة! الفارق: ${differenceCents / 1000} د.أ. يرجى التحقق من المدخلات الحسابية وتطابق القيود.`,
        };
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
          balanced: true,
          differenceCents: 0,
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
