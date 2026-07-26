"use server";

import { and, eq, isNull, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { mapDbError } from "@/lib/db/errors";
import { ratelimit } from "@/lib/ratelimit";
import { catalogComponent } from "./db";
// Phase 3 — استدعاء addCatalogMovement داخل tx عند تفعيل التتبّع لأول مرة مع
// رصيد افتتاحي. أعد الاشتقاق أيضاً عند إلغاء التتبّع (حذف ناعم للحركات القديمة).
import { addCatalogMovement } from "../inventory/actions";
import { catalogMovement } from "../inventory/db";
import { z } from "zod";

type ActionResponse<T = unknown> =
  | { status: "ok"; data: T }
  | { status: "error"; message: string };

const catalogInputSchema = z.object({
  name: z.string().min(1, "الاسم مطلوب").max(200),
  defaultCostCents: z.number().int().nonnegative(),
  unit: z.string().min(1).max(32).default("قطعة"),
  notes: z.string().max(1000).default(""),
  // Phase 3 — علم التتبّع (card 3.H). الافتراضي false. عند تفعيله لأول مرة،
  // يُدخل المستخدم رصيداً افتتاحياً عبر addCatalogMovement(sourceType='opening').
  tracked: z.boolean().default(false),
  // Phase 3 — الرصيد الافتتاحي عند تفعيل التتبّع لأول مرة (card 3.I).
  // يُستخدم فقط إن كان tracked=true. يُطبَّق داخل نفس tx عبر addCatalogMovement.
  openingStock: z.number().int().nonnegative().optional().default(0),
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

  // فصل openingStock عن باقي الحقول (لا تنتمي لجدول catalog_component).
  const { openingStock, ...catalogFields } = parsed.data;

  try {
    const [created] = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(catalogComponent)
        .values(catalogFields)
        .returning();

      // Phase 3 — عند تفعيل التتبّع لأول مرة مع رصيد افتتاحي > 0، ادرج حركة
      // `in` من sourceType='opening' داخل نفس tx (atomic).
      if (catalogFields.tracked && openingStock > 0) {
        await addCatalogMovement({
          tx,
          catalogComponentId: row.id,
          direction: "in",
          quantity: openingStock,
          sourceType: "opening",
          notes: `رصيد افتتاحي عند تفعيل التتبّع: ${catalogFields.name}`,
        });
      }

      return [row];
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

  const { id, updatedAt, openingStock, ...fields } = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(catalogComponent)
        .where(and(eq(catalogComponent.id, id), isNull(catalogComponent.deletedAt)))
        .for("update");

      if (!existing) return { status: "error", message: "العنصر غير موجود" };

      if (new Date(updatedAt).getTime() !== new Date(existing.updatedAt).getTime()) {
        return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
      }

      const [updated] = await tx
        .update(catalogComponent)
        .set(fields)
        .where(eq(catalogComponent.id, id))
        .returning();

      if (!updated) return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };

      // Phase 3 — معالجة التتبّع:
      //   (أ) إذا تفعّل التتبّع لأول مرة (existing.tracked=false → updated.tracked=true):
      //       ادرج حركة `in` من sourceType='opening' إن كان openingStock > 0.
      //   (ب) إذا أُلغي التتبّع (existing.tracked=true → updated.tracked=false):
      //       احذف ناعماً كل الحركات النشطة. الرصيد «يُعامَل كصفر» للطلبات الجديدة،
      //       لكن السجل التاريخي يُحافَظ عليه (INV-5: لا حذف صلب).
      //       UI يُظهر تحذيراً قبل هذا (§6 سيناريو 4 / SA1 NOTE-3).
      if (!existing.tracked && updated.tracked) {
        // (أ) — تفعيل لأول مرة.
        if (openingStock > 0) {
          await addCatalogMovement({
            tx,
            catalogComponentId: id,
            direction: "in",
            quantity: openingStock,
            sourceType: "opening",
            notes: `رصيد افتتاحي عند تفعيل التتبّع: ${updated.name}`,
          });
        }
      } else if (existing.tracked && !updated.tracked) {
        // (ب) — إلغاء التتبّع: احذف ناعماً كل الحركات النشطة.
        await tx
          .update(catalogMovement)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(catalogMovement.catalogComponentId, id),
              isNull(catalogMovement.deletedAt),
            ),
          );
      }
      // (ج) — tracker بقي true مع تعديل الاسم/التكلفة/الوحدة: لا حركة جديدة.

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
        return { status: "error", message: "تم تحديث البيانات من جهة أخرى" };
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
