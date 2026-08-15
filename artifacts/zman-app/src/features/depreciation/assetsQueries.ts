"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { capitalAsset } from "./db";
import { expense, purchase } from "@/features/finance/db";

/**
 * جلب كل الأصول الرأسمالية النشطة مع بيانات الإهلاك المحسوبة لكل أصل.
 * تُستخدَم في شاشة /assets.
 */
export async function getAllCapitalAssets(asOfDate: string) {
  const rows = await db
    .select({
      id: capitalAsset.id,
      name: capitalAsset.name,
      sourceType: capitalAsset.sourceType,
      sourceId: capitalAsset.sourceId,
      purchaseDate: capitalAsset.purchaseDate,
      purchaseAmountCents: capitalAsset.purchaseAmountCents,
      usefulLifeMonths: capitalAsset.usefulLifeMonths,
      monthlyDepreciationCents: capitalAsset.monthlyDepreciationCents,
      startedAt: capitalAsset.startedAt,
      createdAt: capitalAsset.createdAt,
      // أشهر الإهلاك المنقضية حتى asOfDate (صيغة EXTRACT الصحيحة — CRITICAL-NOTE-4)
      monthsElapsedRaw: sql<string>`
        least(
          greatest(
            extract(year from age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + extract(month from age(${asOfDate}::date, ${capitalAsset.startedAt}::date)),
            0
          ),
          ${capitalAsset.usefulLifeMonths}::numeric
        )
      `,
      // الإهلاك المتراكم حتى asOfDate (قاعدة D13: الشهر الأخير يكتسح الباقي)
      accumulatedDepreciationRaw: sql<string>`
        case
          when ${capitalAsset.startedAt}::date > ${asOfDate}::date then 0
          when (
            extract(year from age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + extract(month from age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) >= ${capitalAsset.usefulLifeMonths}
            then ${capitalAsset.purchaseAmountCents}
          else (
            extract(year from age(${asOfDate}::date, ${capitalAsset.startedAt}::date)) * 12
            + extract(month from age(${asOfDate}::date, ${capitalAsset.startedAt}::date))
          ) * ${capitalAsset.monthlyDepreciationCents}
        end
      `,
    })
    .from(capitalAsset)
    .where(and(isNull(capitalAsset.deletedAt)))
    .orderBy(capitalAsset.startedAt);

  return rows.map((r) => {
    const months = Math.round(Number(r.monthsElapsedRaw) || 0);
    const accumulated = Math.round(Number(r.accumulatedDepreciationRaw) || 0);
    const netBookValue = Math.max(r.purchaseAmountCents - accumulated, 0);
    const remainingMonths = Math.max(r.usefulLifeMonths - months, 0);
    const isFullyDepreciated = months >= r.usefulLifeMonths;
    const startedAtStr = new Date(r.startedAt).toISOString().slice(0, 10);
    const isPending = startedAtStr > asOfDate;

    return {
      id: r.id,
      name: r.name,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      purchaseDate: r.purchaseDate,
      purchaseAmountCents: r.purchaseAmountCents,
      usefulLifeMonths: r.usefulLifeMonths,
      monthlyDepreciationCents: r.monthlyDepreciationCents,
      startedAt: r.startedAt,
      createdAt: r.createdAt,
      monthsElapsed: months,
      accumulatedDepreciationCents: accumulated,
      netBookValueCents: netBookValue,
      remainingMonths,
      isFullyDepreciated,
      isPending,
    };
  });
}

export type CapitalAssetWithDepreciation = Awaited<
  ReturnType<typeof getAllCapitalAssets>
>[number];

export interface UndepreciatedCapitalAsset {
  id: string;
  name: string;
  sourceType: "expense" | "purchase";
  sourceId: string;
  purchaseDate: string;
  purchaseAmountCents: number;
  createdAt: Date;
}

/**
 * جلب الأصول الرأسمالية المسجلة في المصاريف أو المشتريات والتي لم يُفعَّل لها إهلاك شهري.
 * تُعرَض في قسم «أصول بلا إهلاك» في شاشة /assets.
 */
export async function getUndepreciatedCapitalAssets(): Promise<UndepreciatedCapitalAsset[]> {
  const expenseRows = await db
    .select({
      id: expense.id,
      description: expense.description,
      category: expense.category,
      date: expense.date,
      amountCents: expense.amountCents,
      createdAt: expense.createdAt,
    })
    .from(expense)
    .where(
      and(
        eq(expense.isCapitalAsset, true),
        isNull(expense.deletedAt),
        sql`not exists (
          select 1 from ${capitalAsset}
          where ${capitalAsset.sourceType} = 'expense'
            and ${capitalAsset.sourceId} = ${expense.id}
            and ${capitalAsset.deletedAt} is null
        )`
      )
    )
    .orderBy(expense.date);

  const purchaseRows = await db
    .select({
      id: purchase.id,
      item: purchase.item,
      date: purchase.date,
      totalCents: purchase.totalCents,
      createdAt: purchase.createdAt,
    })
    .from(purchase)
    .where(
      and(
        eq(purchase.isCapitalAsset, true),
        isNull(purchase.deletedAt),
        sql`not exists (
          select 1 from ${capitalAsset}
          where ${capitalAsset.sourceType} = 'purchase'
            and ${capitalAsset.sourceId} = ${purchase.id}
            and ${capitalAsset.deletedAt} is null
        )`
      )
    )
    .orderBy(purchase.date);

  const mappedExpenses: UndepreciatedCapitalAsset[] = expenseRows.map((r) => ({
    id: r.id,
    name: r.description?.trim() || r.category || "أصل رأسمالي",
    sourceType: "expense",
    sourceId: r.id,
    purchaseDate: r.date,
    purchaseAmountCents: r.amountCents,
    createdAt: r.createdAt,
  }));

  const mappedPurchases: UndepreciatedCapitalAsset[] = purchaseRows.map((r) => ({
    id: r.id,
    name: r.item || "أصل رأسمالي",
    sourceType: "purchase",
    sourceId: r.id,
    purchaseDate: r.date,
    purchaseAmountCents: r.totalCents,
    createdAt: r.createdAt,
  }));

  return [...mappedExpenses, ...mappedPurchases].sort(
    (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
  );
}
