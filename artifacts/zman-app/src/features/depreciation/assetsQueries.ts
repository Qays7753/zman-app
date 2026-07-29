"use server";

import { and, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { capitalAsset } from "./db";

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
