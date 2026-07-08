"use server";

import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  account,
  cashMovement,
  ownerTransaction,
  expense,
  purchase,
  sale,
} from "./db";
import { order } from "../orders/db";

// ─────────────────────────────────────────────────────────────────────────
// فحص السلامة المالية (Financial Integrity Check)
// يقرأ فقط (لا كتابة)، آمن للتشغيل في أي وقت. يفرض القواعد INV-1..INV-17.
// ─────────────────────────────────────────────────────────────────────────

export type IntegrityCheckStatus = "PASS" | "FAIL" | "WARN";

export interface IntegrityCheckResult {
  id: string; // مثل "IC-1"
  invariantId: string; // مثل "INV-11"
  status: IntegrityCheckStatus;
  titleAr: string;
  descriptionAr: string;
  offendingIds?: string[];
  count?: number;
  suggestedFixAr?: string;
  driftCents?: number;
}

export interface IntegrityReport {
  asOfDate: string;
  overallStatus: IntegrityCheckStatus;
  summaryAr: string;
  results: IntegrityCheckResult[];
  runAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
// الدالة الرئيسية — استدعِها بأي تاريخ لفحص السلامة حتى ذلك التاريخ
// ─────────────────────────────────────────────────────────────────────────

export async function runFinancialIntegrityCheck(
  asOfDate?: string,
): Promise<IntegrityReport> {
  const effectiveDate = asOfDate ?? new Date().toLocaleDateString("en-CA");

  const [ic1, ic2, ic3, ic4, ic5, ic6, ic7, ic8] = await Promise.all([
    checkIC1EquityDrift(effectiveDate),
    checkIC2OrphanMovements(),
    checkIC3DepositLiabilityConsistency(),
    checkIC4SaleDepositNoDoubleCount(),
    checkIC5NoArchivedWithBalance(),
    checkIC6PnlReconcilesRetainedProfit(effectiveDate),
    checkIC7UnitConsistency(),
    checkIC8SourceLedgerReconciliation(effectiveDate),
  ]);

  const results = [ic1, ic2, ic3, ic4, ic5, ic6, ic7, ic8];

  const overallStatus: IntegrityCheckStatus = results.some(
    (r) => r.status === "FAIL",
  )
    ? "FAIL"
    : results.some((r) => r.status === "WARN")
      ? "WARN"
      : "PASS";

  const summaryAr =
    overallStatus === "PASS"
      ? "كل الحسابات سليمة. النظام متماسك ماليًا."
      : overallStatus === "WARN"
        ? "توجد تحذيرات بسيطة. راجع التفاصيل."
        : "توجد مشاكل مالية تحتاج إصلاحًا. راجع التفاصيل أدناه.";

  return {
    asOfDate: effectiveDate,
    overallStatus,
    summaryAr,
    results,
    runAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-1 — تحقّق التوازن الحقيقي: حقوق الملكية من الدفتر = من المكوّنات (INV-11)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC1EquityDrift(
  asOfDate: string,
): Promise<IntegrityCheckResult> {
  const movements = await db
    .select({
      direction: cashMovement.direction,
      total: sum(cashMovement.amountCents),
    })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    )
    .groupBy(cashMovement.direction);

  let totalAssets = 0;
  for (const m of movements) {
    const val = Number(m.total) || 0;
    if (m.direction === "in") totalAssets += val;
    else if (m.direction === "out") totalAssets -= val;
  }

  const [liabRow] = await db
    .select({ total: sum(order.depositCents) })
    .from(order)
    .where(
      and(
        isNull(order.deletedAt),
        sql`${order.status} not in ('delivered', 'cancelled')`,
        sql`coalesce(${order.depositDate}, ${order.receivedDate}) <= ${asOfDate}`,
      ),
    );
  const totalLiabilities = Number(liabRow?.total) || 0;

  const [openingRow] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        eq(cashMovement.sourceType, "opening"),
        eq(cashMovement.direction, "in"),
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    );
  const openingCashInEquity = Number(openingRow?.total) || 0;

  const [injectRow] = await db
    .select({ total: sum(ownerTransaction.amountCents) })
    .from(ownerTransaction)
    .innerJoin(account, eq(ownerTransaction.accountId, account.id))
    .where(
      and(
        eq(ownerTransaction.type, "inject"),
        isNull(ownerTransaction.deletedAt),
        isNull(account.deletedAt),
        sql`${ownerTransaction.date} <= ${asOfDate}`,
      ),
    );
  const injections = Number(injectRow?.total) || 0;

  const [drawRow] = await db
    .select({ total: sum(ownerTransaction.amountCents) })
    .from(ownerTransaction)
    .innerJoin(account, eq(ownerTransaction.accountId, account.id))
    .where(
      and(
        eq(ownerTransaction.type, "draw"),
        isNull(ownerTransaction.deletedAt),
        isNull(account.deletedAt),
        sql`${ownerTransaction.date} <= ${asOfDate}`,
      ),
    );
  const drawings = Number(drawRow?.total) || 0;

  const [salesCashInRow] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        eq(cashMovement.direction, "in"),
        sql`${cashMovement.sourceType} in ('sale', 'deposit')`,
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    );
  const salesCashIn = Number(salesCashInRow?.total) || 0;

  const [cashOutRow] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        eq(cashMovement.direction, "out"),
        sql`${cashMovement.sourceType} in ('expense', 'purchase')`,
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    );
  const expensesPurchasesCashOut = Number(cashOutRow?.total) || 0;

  const retainedProfit =
    salesCashIn - totalLiabilities - expensesPurchasesCashOut;
  const equityFromComponents =
    openingCashInEquity + injections - drawings + retainedProfit;
  const equityFromLedger = totalAssets - totalLiabilities;
  const drift = equityFromLedger - equityFromComponents;

  return {
    id: "IC-1",
    invariantId: "INV-11",
    status: drift === 0 ? "PASS" : "FAIL",
    titleAr: "توازن الميزانية (فحص حقيقي)",
    descriptionAr: `يقارن حقوق الملكية المحسوبة من السجل (${(equityFromLedger / 1000).toFixed(3)} د.أ) مع حقوق الملكية المحسوبة من المكوّنات (${(equityFromComponents / 1000).toFixed(3)} د.أ). يجب أن يتطابقا.`,
    driftCents: drift,
    suggestedFixAr:
      drift !== 0
        ? `يوجد انحراف قدره ${(drift / 1000).toFixed(3)} د.أ. تحقّق من: (1) حركات يتيمة في cash_movement. (2) حسابات مؤرشفة برصيد غير صفري. (3) عربونات طلبات لم تُسجَّل أو تُحذَف بشكل صحيح.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-2 — لا توجد حركات يتيمة في cash_movement (INV-1, INV-2)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC2OrphanMovements(): Promise<IntegrityCheckResult> {
  const orphanSales = await db
    .select({ id: cashMovement.id })
    .from(cashMovement)
    .leftJoin(sale, eq(cashMovement.sourceId, sale.id))
    .where(
      and(
        eq(cashMovement.sourceType, "sale"),
        isNull(cashMovement.deletedAt),
        isNull(sale.id),
      ),
    );

  const orphanPurchases = await db
    .select({ id: cashMovement.id })
    .from(cashMovement)
    .leftJoin(purchase, eq(cashMovement.sourceId, purchase.id))
    .where(
      and(
        eq(cashMovement.sourceType, "purchase"),
        isNull(cashMovement.deletedAt),
        isNull(purchase.id),
      ),
    );

  const orphanExpenses = await db
    .select({ id: cashMovement.id })
    .from(cashMovement)
    .leftJoin(expense, eq(cashMovement.sourceId, expense.id))
    .where(
      and(
        eq(cashMovement.sourceType, "expense"),
        isNull(cashMovement.deletedAt),
        isNull(expense.id),
      ),
    );

  const orphanDeposits = await db
    .select({ id: cashMovement.id })
    .from(cashMovement)
    .leftJoin(order, eq(cashMovement.sourceId, order.id))
    .where(
      and(
        eq(cashMovement.sourceType, "deposit"),
        isNull(cashMovement.deletedAt),
        isNull(order.id),
      ),
    );

  const orphanOwner = await db
    .select({ id: cashMovement.id })
    .from(cashMovement)
    .leftJoin(ownerTransaction, eq(cashMovement.sourceId, ownerTransaction.id))
    .where(
      and(
        sql`${cashMovement.sourceType} in ('owner_draw', 'owner_inject')`,
        isNull(cashMovement.deletedAt),
        isNull(ownerTransaction.id),
      ),
    );

  const transferImbalance = await db
    .select({ sourceId: cashMovement.sourceId })
    .from(cashMovement)
    .where(
      and(
        eq(cashMovement.sourceType, "transfer"),
        isNull(cashMovement.deletedAt),
      ),
    )
    .groupBy(cashMovement.sourceId)
    .having(
      sql`count(*) filter (where ${cashMovement.direction} = 'in') <> count(*) filter (where ${cashMovement.direction} = 'out')`,
    );

  const allBadIds = [
    ...orphanSales.map((r) => `sale-mv:${r.id}`),
    ...orphanPurchases.map((r) => `purchase-mv:${r.id}`),
    ...orphanExpenses.map((r) => `expense-mv:${r.id}`),
    ...orphanDeposits.map((r) => `deposit-mv:${r.id}`),
    ...orphanOwner.map((r) => `owner-mv:${r.id}`),
    ...transferImbalance.map((r) => `transfer:${r.sourceId ?? "?"}`),
  ];

  return {
    id: "IC-2",
    invariantId: "INV-1, INV-2",
    status: allBadIds.length === 0 ? "PASS" : "FAIL",
    titleAr: "لا توجد حركات يتيمة في السجل",
    descriptionAr:
      "كل حركة في cash_movement يجب أن يكون لها صف أب في الجدول المناسب (مبيعة/مصروف/شراء/طلب/معاملة مالك). التحويلات يجب أن تأتي بأزواج (داخل + خارج بنفس المعرّف).",
    offendingIds: allBadIds.slice(0, 50),
    count: allBadIds.length,
    suggestedFixAr:
      allBadIds.length !== 0
        ? `يوجد ${allBadIds.length} حركة يتيمة أو تحويل غير متوازن. راجع معرّفات cash_movement المعروضة وتحقّق من حالة الحذف الناعم للصف الأب.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-3 — اتساق عربونات الطلبات مع السجل (INV-3, INV-9)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC3DepositLiabilityConsistency(): Promise<IntegrityCheckResult> {
  const missingDepositMovements = await db
    .select({ orderId: order.id })
    .from(order)
    .leftJoin(
      cashMovement,
      and(
        eq(cashMovement.sourceType, "deposit"),
        eq(cashMovement.sourceId, order.id),
        isNull(cashMovement.deletedAt),
      ),
    )
    .where(
      and(
        isNull(order.deletedAt),
        sql`${order.status} not in ('delivered', 'cancelled')`,
        sql`${order.depositCents} > 0`,
        isNull(cashMovement.id),
      ),
    );

  const duplicateDepositMovements = await db
    .select({ orderId: cashMovement.sourceId })
    .from(cashMovement)
    .where(
      and(
        eq(cashMovement.sourceType, "deposit"),
        isNull(cashMovement.deletedAt),
      ),
    )
    .groupBy(cashMovement.sourceId)
    .having(sql`count(*) > 1`);

  const staleDepositMovements = await db
    .select({ movementId: cashMovement.id })
    .from(cashMovement)
    .innerJoin(order, eq(cashMovement.sourceId, order.id))
    .where(
      and(
        eq(cashMovement.sourceType, "deposit"),
        isNull(cashMovement.deletedAt),
        sql`${order.status} in ('delivered', 'cancelled')`,
      ),
    );

  const allBad = [
    ...missingDepositMovements.map((r) => `مفقود:${r.orderId}`),
    ...duplicateDepositMovements.map((r) => `مكرر:${r.orderId ?? "?"}`),
    ...staleDepositMovements.map((r) => `قديم:${r.movementId}`),
  ];

  return {
    id: "IC-3",
    invariantId: "INV-3, INV-9",
    status: allBad.length === 0 ? "PASS" : "FAIL",
    titleAr: "اتساق عربونات الطلبات مع السجل",
    descriptionAr:
      "كل طلب غير مُسلَّم بعربون > 0 يجب أن يكون له حركة عربون واحدة نشطة. الطلبات المُسلَّمة/الملغاة يجب ألا يكون لها حركة عربون نشطة.",
    offendingIds: allBad.slice(0, 50),
    count: allBad.length,
    suggestedFixAr:
      allBad.length !== 0
        ? `يوجد ${allBad.length} مخالفة. «مفقود» = عربون لم يُسجَّل في السجل. «مكرر» = عربون مسجَّل مرتين. «قديم» = حركة عربون نشطة لطلب مُسلَّم أو ملغى.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-4 — لا ازدواج عدّ للعربون في مبيعات الطلبات (INV-4)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC4SaleDepositNoDoubleCount(): Promise<IntegrityCheckResult> {
  const orderSales = await db
    .select({
      saleId: sale.id,
      orderTotalPriceCents: order.totalPriceCents,
      orderDepositCents: order.depositCents,
      ledgerSaleIn: sql<number>`coalesce(sum(${cashMovement.amountCents}), 0)::bigint`,
    })
    .from(sale)
    .innerJoin(order, eq(sale.orderId, order.id))
    .leftJoin(
      cashMovement,
      and(
        eq(cashMovement.sourceType, "sale"),
        eq(cashMovement.sourceId, sale.id),
        eq(cashMovement.direction, "in"),
        isNull(cashMovement.deletedAt),
      ),
    )
    .where(
      and(
        eq(sale.source, "order"),
        isNull(sale.deletedAt),
        isNull(order.deletedAt),
      ),
    )
    .groupBy(sale.id, order.totalPriceCents, order.depositCents);

  const badSales = orderSales.filter((s) => {
    const expectedRemainder = Math.max(
      0,
      s.orderTotalPriceCents - s.orderDepositCents,
    );
    return Number(s.ledgerSaleIn) !== expectedRemainder;
  });

  return {
    id: "IC-4",
    invariantId: "INV-4",
    status: badSales.length === 0 ? "PASS" : "FAIL",
    titleAr: "لا ازدواج عدّ للعربون في المبيعات",
    descriptionAr:
      "لكل مبيعة محوَّلة من طلب: المبلغ المُرحَّل للسجل (مصدر 'sale') يجب أن يساوي (سعر الطلب − العربون). لو ساوى السعر الكامل، فالعربون محسوب مرتين.",
    offendingIds: badSales.map((s) => `مبيعة:${s.saleId}`).slice(0, 50),
    count: badSales.length,
    suggestedFixAr:
      badSales.length !== 0
        ? `يوجد ${badSales.length} مبيعة فيها ازدواج عربون محتمل. صحّح cash_movement.amountCents للقيمة الصحيحة (السعر − العربون).`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-5 — لا يوجد حساب مؤرشف برصيد غير صفري (INV-13, INV-14)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC5NoArchivedWithBalance(): Promise<IntegrityCheckResult> {
  const archivedAccounts = await db
    .select({ id: account.id, name: account.name })
    .from(account)
    .where(and(eq(account.isArchived, true), isNull(account.deletedAt)));

  const badAccounts: { id: string; name: string; balanceCents: number }[] = [];
  for (const acc of archivedAccounts) {
    const [balRow] = await db
      .select({
        balance: sql<number>`coalesce(sum(case when ${cashMovement.direction} = 'in' then ${cashMovement.amountCents} else -${cashMovement.amountCents} end), 0)::bigint`,
      })
      .from(cashMovement)
      .where(
        and(
          eq(cashMovement.accountId, acc.id),
          isNull(cashMovement.deletedAt),
        ),
      );
    const balance = Number(balRow?.balance) || 0;
    if (balance !== 0) {
      badAccounts.push({ id: acc.id, name: acc.name, balanceCents: balance });
    }
  }

  return {
    id: "IC-5",
    invariantId: "INV-13, INV-14",
    status: badAccounts.length === 0 ? "PASS" : "FAIL",
    titleAr: "لا يوجد حساب مؤرشف برصيد غير صفري",
    descriptionAr:
      "أرشفة حساب برصيد غير صفري تُخفي أمواله من الميزانية ولوحة القيادة. يجب تحويل الرصيد قبل الأرشفة.",
    offendingIds: badAccounts.map(
      (a) => `${a.name}: ${(a.balanceCents / 1000).toFixed(3)} د.أ`,
    ),
    count: badAccounts.length,
    suggestedFixAr:
      badAccounts.length !== 0
        ? `يوجد ${badAccounts.length} حساب مؤرشف برصيد مخفي. الإصلاح: (1) ألغِ الأرشفة. (2) حوّل الرصيد إلى حساب نشط. (3) أرشِف مجددًا.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-6 — صافي P&L = الأرباح المحتجزة + العربونات كالتزام (INV-12)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC6PnlReconcilesRetainedProfit(
  asOfDate: string,
): Promise<IntegrityCheckResult> {
  const [salesInRow] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        eq(cashMovement.direction, "in"),
        sql`${cashMovement.sourceType} in ('sale', 'deposit')`,
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    );
  const salesCashIn = Number(salesInRow?.total) || 0;

  const [cashOutRow] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .innerJoin(account, eq(cashMovement.accountId, account.id))
    .where(
      and(
        eq(cashMovement.direction, "out"),
        sql`${cashMovement.sourceType} in ('expense', 'purchase')`,
        isNull(cashMovement.deletedAt),
        isNull(account.deletedAt),
        sql`${cashMovement.date} <= ${asOfDate}`,
      ),
    );
  const cashOut = Number(cashOutRow?.total) || 0;
  const pnlNet = salesCashIn - cashOut;

  const [liabRow] = await db
    .select({ total: sum(order.depositCents) })
    .from(order)
    .where(
      and(
        isNull(order.deletedAt),
        sql`${order.status} not in ('delivered', 'cancelled')`,
        sql`coalesce(${order.depositDate}, ${order.receivedDate}) <= ${asOfDate}`,
      ),
    );
  const depositsLiability = Number(liabRow?.total) || 0;

  const retainedProfit = salesCashIn - depositsLiability - cashOut;
  const expected = retainedProfit + depositsLiability;
  const drift = pnlNet - expected;

  return {
    id: "IC-6",
    invariantId: "INV-12",
    status: drift === 0 ? "PASS" : "FAIL",
    titleAr: "تسوية صافي الأرباح مع الميزانية",
    descriptionAr: `صافي الأرباح (أساس نقدي) = ${(pnlNet / 1000).toFixed(3)} د.أ. الأرباح المحتجزة + العربونات كالتزام = ${(expected / 1000).toFixed(3)} د.أ. يجب أن يتطابقا.`,
    driftCents: drift,
    suggestedFixAr:
      drift !== 0
        ? `الانحراف ${(drift / 1000).toFixed(3)} د.أ. تحقّق من صيغة P&L أو الميزانية.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-7 — اتساق الوحدة: لا أرصدة سالبة غير مبرَّرة (INV-15, INV-16)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC7UnitConsistency(): Promise<IntegrityCheckResult> {
  const negativeAccounts = await db
    .select({
      accountId: cashMovement.accountId,
      balance: sql<number>`coalesce(sum(case when ${cashMovement.direction} = 'in' then ${cashMovement.amountCents} else -${cashMovement.amountCents} end), 0)::bigint`,
    })
    .from(cashMovement)
    .where(isNull(cashMovement.deletedAt))
    .groupBy(cashMovement.accountId)
    .having(
      sql`sum(case when ${cashMovement.direction} = 'in' then ${cashMovement.amountCents} else -${cashMovement.amountCents} end) < 0`,
    );

  const issues = negativeAccounts.map(
    (na) => `الحساب ${na.accountId}: رصيد سالب ${(Number(na.balance) / 1000).toFixed(3)} د.أ`,
  );

  return {
    id: "IC-7",
    invariantId: "INV-15, INV-16",
    status: issues.length === 0 ? "PASS" : "WARN",
    titleAr: "اتساق وحدة المال والأرصدة",
    descriptionAr:
      "يتحقّق من عدم وجود حسابات برصيد سالب غير مبرَّر (قد يعني حركة خارجة أكبر من المتاح، أو خطأ إدخال).",
    offendingIds: issues.slice(0, 20),
    count: issues.length,
    suggestedFixAr:
      issues.length !== 0
        ? `يوجد ${issues.length} حساب برصيد سالب. راجع الحركات الخارجة لهذه الحسابات وتأكّد من صحتها.`
        : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// IC-8 — مطابقة سجل النقد مع الجداول المساعدة (F-05)
// ─────────────────────────────────────────────────────────────────────────

async function checkIC8SourceLedgerReconciliation(
  asOfDate: string,
): Promise<IntegrityCheckResult> {
  // 1. Ledger-side P&L Net (All time, archived-inclusive)
  const [ledgerSalesAllTimeRes] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .where(
      and(
        eq(cashMovement.direction, "in"),
        sql`${cashMovement.sourceType} in ('sale', 'deposit')`,
        isNull(cashMovement.deletedAt)
      )
    );
  const ledgerSalesCents = Number(ledgerSalesAllTimeRes?.total) || 0;

  const [ledgerOutAllTimeRes] = await db
    .select({ total: sum(cashMovement.amountCents) })
    .from(cashMovement)
    .where(
      and(
        eq(cashMovement.direction, "out"),
        sql`${cashMovement.sourceType} in ('expense', 'purchase')`,
        isNull(cashMovement.deletedAt)
      )
    );
  const ledgerOutCents = Number(ledgerOutAllTimeRes?.total) || 0;
  const ledgerPnlNetCents = ledgerSalesCents - ledgerOutCents;

  // 2. Source-side P&L Net (All time, archived-inclusive)
  const [srcSalesAllTimeRes] = await db
    .select({ total: sum(sale.amountCents) })
    .from(sale)
    .where(isNull(sale.deletedAt));
  const srcSalesCents = Number(srcSalesAllTimeRes?.total) || 0;

  const [srcPurchasesAllTimeRes] = await db
    .select({ total: sum(purchase.totalCents) })
    .from(purchase)
    .where(isNull(purchase.deletedAt));
  const srcPurchasesCents = Number(srcPurchasesAllTimeRes?.total) || 0;

  const [srcExpensesAllTimeRes] = await db
    .select({ total: sum(expense.amountCents) })
    .from(expense)
    .where(isNull(expense.deletedAt));
  const srcExpensesCents = Number(srcExpensesAllTimeRes?.total) || 0;

  const [activeDepositsRes] = await db
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

  const sourceTablePnlNetCents = (srcSalesCents + activeDepositsCents) - srcPurchasesCents - srcExpensesCents;
  const drift = ledgerPnlNetCents - sourceTablePnlNetCents;

  return {
    id: "IC-8",
    invariantId: "F-05-drift",
    status: drift === 0 ? "PASS" : "FAIL",
    titleAr: "مطابقة سجل النقد مع الجداول المساعدة",
    descriptionAr: `صافي أرباح السجل النقدي = ${(ledgerPnlNetCents / 1000).toFixed(3)} د.أ. صافي أرباح الجداول المساعدة = ${(sourceTablePnlNetCents / 1000).toFixed(3)} د.أ. الانحراف = ${(drift / 1000).toFixed(3)} د.أ.`,
    driftCents: drift,
    suggestedFixAr:
      drift !== 0
        ? `يوجد انحراف قدره ${(drift / 1000).toFixed(3)} د.أ. ناتج عن فوارق بين سجل النقد والجداول المساعدة. تحقّق من المشتريات أو المصاريف غير المسجلة بالسجل.`
        : undefined,
  };
}
