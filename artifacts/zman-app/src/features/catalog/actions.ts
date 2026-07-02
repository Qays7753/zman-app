"use server";

import { and, eq, isNull, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { catalogComponent } from "./db";
import { z } from "zod";

type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

const catalogInputSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(200),
  defaultCostCents: z.number().int().nonnegative(),
  unit: z.string().min(1).max(32).default("قطعة"),
  notes: z.string().max(1000).default(""),
});

async function checkRL() {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  return ratelimit.limit(ip);
}

export async function createCatalogComponent(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  const parsed = catalogInputSchema.safeParse(rawInput);
  if (!parsed.success) return { status: "error", message: "بيانات غير صالحة" };

  try {
    const [created] = await db.transaction(async (tx) => {
      return tx.insert(catalogComponent).values(parsed.data).returning();
    });
    revalidatePath("/catalog");
    return { status: "ok", data: created };
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function updateCatalogComponent(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  const schema = catalogInputSchema.extend({
    id: z.string().uuid(),
    updatedAt: z.union([z.string(), z.date()]).transform((val) =>
      val instanceof Date ? val.toISOString() : val
    ),
  });
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) return { status: "error", message: "بيانات غير صالحة" };

  const { id, updatedAt, ...fields } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(catalogComponent)
        .where(and(eq(catalogComponent.id, id), isNull(catalogComponent.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "العنصر غير موجود" };

      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "السجل تم تعديله من جلسة أخرى — حدّث الصفحة" };
      }

      const [updated] = await tx
        .update(catalogComponent)
        .set(fields)
        .where(eq(catalogComponent.id, id))
        .returning();

      if (!updated) return { status: "error", message: "السجل تم تعديله — حدّث الصفحة" };

      revalidatePath("/catalog");
      return { status: "ok", data: updated };
    });
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function deleteCatalogComponent(id: string, updatedAt: string): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(catalogComponent)
        .where(and(eq(catalogComponent.id, id), isNull(catalogComponent.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "العنصر غير موجود" };

      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "السجل تم تعديله — حدّث الصفحة" };
      }

      await tx
        .update(catalogComponent)
        .set({ deletedAt: new Date() })
        .where(eq(catalogComponent.id, id));

      revalidatePath("/catalog");
      return { status: "ok", data: null };
    });
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function getCatalogComponents(search?: string) {
  const conditions = [isNull(catalogComponent.deletedAt)];
  if (search?.trim()) {
    conditions.push(ilike(catalogComponent.name, `%${search.trim()}%`));
  }
  const rows = await db
    .select()
    .from(catalogComponent)
    .where(and(...conditions))
    .orderBy(catalogComponent.name);

  return rows;
}
