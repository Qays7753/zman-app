"use server";

import { and, eq, isNull, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { snippet } from "./db";
import { z } from "zod";

type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

const snippetInputSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب").max(200),
  body: z.string().min(1, "النص مطلوب").max(5000),
  category: z.string().min(1).max(64).default("عام"),
});

async function checkRL() {
  const ip = (await headers()).get("x-forwarded-for") || "127.0.0.1";
  return ratelimit.limit(ip);
}

export async function createSnippet(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  const parsed = snippetInputSchema.safeParse(rawInput);
  if (!parsed.success) return { status: "error", message: "بيانات غير صالحة" };

  try {
    const [created] = await db.transaction(async (tx) => {
      return tx.insert(snippet).values(parsed.data).returning();
    });
    revalidatePath("/snippets");
    return { status: "ok", data: created };
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function updateSnippet(rawInput: unknown): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  const schema = snippetInputSchema.extend({
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
        .from(snippet)
        .where(and(eq(snippet.id, id), isNull(snippet.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "الملاحظة غير موجودة" };

      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "السجل تم تعديله — حدّث الصفحة" };
      }

      const [updated] = await tx
        .update(snippet)
        .set(fields)
        .where(and(eq(snippet.id, id), eq(snippet.updatedAt, existing.updatedAt)))
        .returning();

      if (!updated) return { status: "error", message: "السجل تم تعديله — حدّث الصفحة" };

      revalidatePath("/snippets");
      return { status: "ok", data: updated };
    });
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function deleteSnippet(id: string, updatedAt: string): Promise<ActionResponse> {
  const { success } = await checkRL();
  if (!success) return { status: "error", message: "تجاوزت الحد المسموح" };

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(snippet)
        .where(and(eq(snippet.id, id), isNull(snippet.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "الملاحظة غير موجودة" };

      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "السجل تم تعديله — حدّث الصفحة" };
      }

      await tx
        .update(snippet)
        .set({ deletedAt: new Date() })
        .where(and(eq(snippet.id, id), eq(snippet.updatedAt, existing.updatedAt)));

      revalidatePath("/snippets");
      return { status: "ok", data: null };
    });
  } catch (e) {
    return { status: "error", message: mapDbError(e) };
  }
}

export async function getSnippets(search?: string) {
  const conditions = [isNull(snippet.deletedAt)];
  if (search?.trim()) {
    conditions.push(
      or(
        ilike(snippet.title, `%${search.trim()}%`),
        ilike(snippet.body, `%${search.trim()}%`),
      )!,
    );
  }
  const rows = await db
    .select()
    .from(snippet)
    .where(and(...conditions))
    .orderBy(snippet.category, snippet.title);

  return rows;
}
