"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { idempotencyKey, order, orderComponent } from "../orders/db";
import { sale, expense } from "../finance/db";
import { catalogComponent } from "../catalog/db";
import { catalogMovement } from "./db";
import { getAmmanDate } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// inventory/actions — دوال الكتابة على catalog_movement
// ─────────────────────────────────────────────────────────────────────────
// جميع الدوال تقبل `tx` (معاملة Drizzle) لتُستدعى داخل transaction الخارجي
// (convertOrderToSale / reverseSale / createPurchase / updatePurchase). هذا
// يضمن atomicity: أي فشل في حركة المخزون يُلغي transaction الأب بالكامل.
//
// Idempotency: إن مُرِّر `requestId`، نتحقق من idempotency_key قبل الإدراج.
// نفس النمط المُتَّبع في finance/actions.ts (§5.6).
//
// التشغيلي البحت: لا حركة صندوق، لا P&L، لا ميزانية. inventory فقط.
// ─────────────────────────────────────────────────────────────────────────

// نوع المعاملة Drizzle. نستخدم any لأن نوع tx المُمرَّر من db.transaction هو
// PgTransaction الداخلي والذي يصعب التعبير عنه بدون generics.
// biome-ignore lint/suspicious/noExplicitAny: drizzle tx type is complex
type Tx = any;

interface AddCatalogMovementInput {
  tx: Tx;
  catalogComponentId: string;
  direction: "in" | "out";
  quantity: number;
  sourceType:
    | "purchase"
    | "order_delivery"
    | "opening"
    | "adjustment"
    | "manual_in"
    | "manual_out";
  sourceId?: string;
  orderComponentId?: string;
  notes?: string;
  date?: string;
  requestId?: string;
  /**
   * Phase 3-revised (D4 fix) — سعر الوحدة بالـ fils لكل وحدة عند تسجيل الحركة.
   * للحركة `in` من purchase: floor(purchase.totalCents / quantity).
   * للحركة `out` من order_delivery: التكلفة الوسطية المرجَّحة لحظة البيع.
   * اختياري — يُترك NULL للأصناف غير المتتبَّعة وللتسويات اليدوية (adjustStock).
   */
  unitCostCents?: number;
  /**
   * SA1 (A1 fix) — إجمالي قيمة الحركة بالـ fils (integer، لا تقريب).
   * - للحركة `in` من purchase: totalValueCents = purchase.totalCents (مطابقاً
   *   لمبلغ الصندوق المخصوم) لتفادي equityDrift من كسور الـ fils.
   * - للحركة `out` من order_delivery / manual_out: totalValueCents = quantity × unitCostCents
   *   (= COGS للحركة، مطابقاً للقيمة المخصومة من المخزون).
   * - للحركات الافتتاحية/اليدوية بلا سعر: NULL — صيغة القراءة coalesce إلى
   *   `qty × coalesce(unit_cost_cents, 0)` (= 0). لا حاجة لتمريره صراحةً.
   * اختياري — يُترك NULL عند عدم التمرير. الاستعلامات تتعامل مع NULL عبر COALESCE.
   */
  totalValueCents?: number;
}

/**
 * إدراج حركة مخزون واحدة. لا تتحقق من tracked — المتصل مسؤول عن ذلك.
 * يُستخدم من createPurchase (direction='in', sourceType='purchase')،
 * من convertOrderToSale (direction='out', sourceType='order_delivery')،
 * ومن CatalogClient (direction='in', sourceType='opening' للتتبّع الأول،
 * direction='out', sourceType='manual_out' للصرف اليدوي).
 *
 * Idempotency: إن مُرِّر requestId، تحقّق من idempotency_key. إن وُجد المفتاح،
 * نُعيد الحركة المرتبطة عبر targetId (لا عبر استعلام WHERE source_id = '' الذي
 * يُطلِق خطأ Postgres «invalid input syntax for type uuid» عندما يكون sourceId
 * غير مُمرَّر — D9 fix). إن لم تُوجَد الحركة (حالة نادرة: مفتاح بلا حركة)،
 * نرمي خطأ صريح بدل إرجاع { id: "" } الصامت.
 */
export async function addCatalogMovement(
  input: AddCatalogMovementInput,
): Promise<{ id: string; quantity: number; direction: "in" | "out" }> {
  const {
    tx,
    catalogComponentId,
    direction,
    quantity,
    sourceType,
    sourceId,
    orderComponentId,
    notes,
    date,
    requestId,
    unitCostCents,
    totalValueCents,
  } = input;

  if (quantity <= 0) {
    throw new Error("الكمية يجب أن تكون موجبة");
  }

  // Idempotency: إن مُرِّر requestId، تحقّق من idempotency_key.
  // إن وُجد مفتاح لنفس requestId، اعتبر العملية مُنجَزة (return بدون كتابة).
  if (requestId) {
    const [existingKey] = await tx
      .select()
      .from(idempotencyKey)
      .where(eq(idempotencyKey.requestId, requestId));

    if (existingKey) {
      // D9 fix: ابحث عن الحركة المرتبطة عبر targetId المُسجَّل في idempotency_key
      // (وليس عبر WHERE source_id = '' الذي كان يُطلِق خطأ uuid cuando sourceId
      // غير مُمرَّر من adjustStock). اقتصر على نفس catalogComponentId لإضافة أمان
      // إضافي ضد أي تضارب بين الأصناف. إن لم تُوجَد الحركة (مفتاح بلا حركة — حالة
      // نادرة بعد حذف ناعم)، ارفع خطأ صريح بدل إرجاع { id: "" }.
      const [existingMov] = await tx
        .select()
        .from(catalogMovement)
        .where(
          and(
            eq(catalogMovement.id, existingKey.targetId),
            eq(catalogMovement.catalogComponentId, catalogComponentId),
          ),
        )
        .limit(1);
      if (existingMov) {
        return {
          id: existingMov.id,
          quantity: existingMov.quantity,
          direction: existingMov.direction as "in" | "out",
        };
      }
      // requestId موجود لكن الحركة غير موجودة — لا نُدرج. ارفع خطأ صريح كي يُعالِج
      // المتصل (لا يُرجِع id فارغ يُمرَّر صامتاً لعمل لاحق).
      throw new Error(
        `تعذّر إيجاد حركة المخزون المرتبطة بـ requestId=${existingKey.requestId} ` +
          `(targetId=${existingKey.targetId}). قد تكون الحركة محذوفة ناعماً. ` +
          `أعد المحاولة بـ requestId جديد.`,
      );
    }
  }

  const [row] = await tx
    .insert(catalogMovement)
    .values({
      date: date ?? getAmmanDate(),
      catalogComponentId,
      direction,
      quantity,
      sourceType,
      sourceId: sourceId ?? null,
      orderComponentId: orderComponentId ?? null,
      notes: notes ?? "",
      unitCostCents: unitCostCents ?? null,
      totalValueCents: totalValueCents ?? null,
    })
    .returning({ id: catalogMovement.id });

  if (!row) throw new Error("فشل إدراج حركة المخزون");

  if (requestId) {
    await tx.insert(idempotencyKey).values({
      requestId,
      action: "catalog_movement",
      targetId: row.id,
    });
  }

  return { id: row.id, quantity, direction };
}

interface DeductForDeliveryInput {
  tx: Tx;
  orderId: string;
  saleId: string;
  requestId?: string;
}

/**
 * خصم المخزون عند تحويل طلب إلى مبيعة (convertOrderToSale).
 *
 * المنطق:
 *   - اجلب كل order_component.rows WHERE catalog_component_id IS NOT NULL.
 *   - لكل صف: اجلب catalog_component وتحقّق tracked=true. (الأصناف غير المتتبَّعة
 *     لا تُنشئ حركة — silent skip، سلوك القائمة البيضاء.)
 *   - الكمية المطلوب خصمها = orderComponent.quantity × order.quantity.
 *     (orderComponent.quantity = «التكرار في الوحدة»، order.quantity = كمية المنتج.
 *      مثال: مكوّن بتكرار 5 في طلب بكمية 3 = 15 وحدة تُخصم.)
 *   - sourceType='order_delivery', sourceId=saleId, orderComponentId=مكون.الطلب.
 *   - notes يتضمّن تحذير السالب إن الرصيد الحالي < الكمية المطلوبة (§6 سيناريو 1:
 *     لا منع، فقط توثيق في notes).
 *
 * Atomicity: تُستدعى داخل transaction الـ sale. أي فشل (FK/CHECK) يُلغي الكل.
 *
 * @returns صفوف catalog_movement المُنشأة (للتتبّع والاختبار).
 */
export async function deductForDelivery(input: DeductForDeliveryInput) {
  const { tx, orderId, saleId, requestId } = input;

  // 1. قفل صف الطلب واجلب الكمية الإجمالية للمنتج.
  const [orderRow] = await tx
    .select({ id: order.id, quantity: order.quantity })
    .from(order)
    .where(eq(order.id, orderId))
    .for("update");

  if (!orderRow) {
    // الطلب محذوف أو غير موجود — لا شيء نخصمه. (convertOrderToSale قفل الطلب
    // مسبقاً وتحقّق من وجوده، فلا نفترض وقوع هذا.)
    return [];
  }

  // 2. اجلب كل مكوّنات الطلب المرتبطة بصنف كتالوج.
  const components = await tx
    .select({
      id: orderComponent.id,
      name: orderComponent.name,
      quantity: orderComponent.quantity,
      catalogComponentId: orderComponent.catalogComponentId,
    })
    .from(orderComponent)
    .where(eq(orderComponent.orderId, orderId));

  if (components.length === 0) return [];

  // 3. لكل مكوّن مرتبط: تحقّق tracked + احسب الرصيد الحالي + اخصم.
  const createdMovements: Array<{
    id: string;
    catalogComponentId: string;
    orderComponentId: string;
    quantity: number;
    balanceBefore: number;
    balanceAfter: number;
    unitCostCents: number;
  }> = [];

  for (const c of components) {
    if (!c.catalogComponentId) continue; // مكوّن حر (free-text) — no-op.

    // اجلب الصنف وقفله لتجنّب السباق.
    const [comp] = await tx
      .select({
        id: catalogComponent.id,
        name: catalogComponent.name,
        tracked: catalogComponent.tracked,
      })
      .from(catalogComponent)
      .where(eq(catalogComponent.id, c.catalogComponentId))
      .for("update");

    if (!comp) {
      // FK ON DELETE RESTRICT يحمي من حذف صنف مُستخدَم، لكن نتحقق دفاعياً.
      throw new Error(
        `الصنف المرتبط بمكوّن «${c.name}» غير موجود. ` +
          `لا يمكن خصم المخزون. احذف المكوّن أو اربطه بصنف آخر.`,
      );
    }

    if (!comp.tracked) continue; // صنف غير متتبَّع — silent skip.

    // الكمية المطلوب خصمها = تكرار المكوّن في الوحدة × كمية المنتج.
    const requiredQty = c.quantity * orderRow.quantity;
    if (requiredQty <= 0) continue;

    // احسب الرصيد الحالي قبل الخصم (للتوثيق في notes إن كان سالباً).
    const balanceBefore = await getTxComponentBalance(tx, comp.id);
    let notes = `خصم توصيل طلب #${orderId.slice(0, 8)} — ${comp.name} (${c.quantity} × ${orderRow.quantity})`;
    if (balanceBefore < requiredQty) {
      // §6 سيناريو 1: لا منع للسالب — فقط سجّل التحذير في notes.
      notes += ` ⚠️ الرصيد قبل الخصم (${balanceBefore}) أقل من المطلوب (${requiredQty}) — رصيد سالب بعد الخصم.`;
    }

    // Phase 3-revised (D4 fix) — احسب التكلفة الوسطية المرجَّحة لحظة البيع من
    // كل الحركات `in` النشطة (deletedAt IS NULL) حتى الآن. الصيغة:
    //   weightedAvgCost = Σ(quantity × coalesce(unit_cost_cents, 0)) / Σ(quantity)
    // الحركات الافتتاحية/اليدوية بلا unit_cost_cents تُعامَل كتكلفتها 0 (مخزون
    // مجاني). إن لم تكن هناك حركات in إطلاقاً، التكلفة = 0 (لا COGS). القيمة
    // تُخزَّن على الحركة out (unit_cost_cents) لتكون COGS غير قابلة للتعديل
    // لاحقاً (immutable) — النموذج الموحَّد للقيمة الدفترية للمخزون.
    //
    // SA1 (A1 fix) — نُخزِّن أيضاً total_value_cents = requiredQty × unitCostCents
    // على الحركة out. هذا يُطابِق القيمة المخصومة من المخزون (في inventoryValueCents)
    // مع COGS المخصوم من retainedProfitCents — فلا يظهر equityDrift حتى لو
    // floor(totalCents/qty) ترك كسراً. الـ fallback في الاستعلامات يضمن أن
    // الحركات القديمة (قبل 0024) بلا total_value_cents تُعامَل بـ qty × unit_cost.
    //
    // SA1 (A4 fix — Round 4) — قاعدة «آخر حركة out تكتسح الباقي الدفتري».
    // إذا كانت الكمية المطلوبة ≥ الرصيد المتاح (balanceBefore) فإن هذه الحركة
    // تأخذ كل المخزون المتبقي فعلياً. نحسب bookValueBefore = Σ(in total_value) −
    // Σ(out total_value) قبل هذه الحركة. إن وجدنا أن totalValueCents المحسوب
    // بالوسط المرجَّح أقل من bookValueBefore (بسبب فقدان كسور floor)، نضع
    // totalValueCents = bookValueBefore بالكامل. هذا يُحرِّر القيمة الدفترية
    // المتبقية (1 fils عادةً) من المخزون عند نفاده تاماً، فلا يبقى bookValue=1
    // على رصيد صفري. نفس منطق D13 (الشهر الأخير للإهلاك يكتسح الباقي).
    const [costRow] = await tx
      .select({
        totalQty: sql<number>`coalesce(sum(${catalogMovement.quantity}), 0)::bigint`,
        totalCost: sql<number>`coalesce(sum(${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)), 0)::bigint`,
      })
      .from(catalogMovement)
      .where(
        and(
          eq(catalogMovement.catalogComponentId, comp.id),
          eq(catalogMovement.direction, "in"),
          isNull(catalogMovement.deletedAt),
        ),
      );

    const totalQty = Number(costRow?.totalQty) || 0;
    const totalCost = Number(costRow?.totalCost) || 0;
    const unitCostCents = totalQty > 0 ? Math.floor(totalCost / totalQty) : 0;
    let totalValueCents = requiredQty * unitCostCents;

    // A4 fix — احسب القيمة الدفترية الحالية (Σ in total_value − Σ out total_value)
    // قبل هذه الحركة. إن أخذت الحركة كل الرصيد المتاح (أو أكثر)، اكتسح الباقي
    // الدفتري لتفادي residual 1-fils على رصيد صفري.
    const [bvRow] = await tx
      .select({
        bookValue: sql<number>`coalesce(sum(
          case when ${catalogMovement.direction} = 'in'
               then coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))
               else -(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)))
          end
        ), 0)::bigint`,
      })
      .from(catalogMovement)
      .where(
        and(
          eq(catalogMovement.catalogComponentId, comp.id),
          isNull(catalogMovement.deletedAt),
        ),
      );
    const bookValueBefore = Number(bvRow?.bookValue) || 0;

    if (requiredQty >= balanceBefore && bookValueBefore > totalValueCents) {
      totalValueCents = bookValueBefore;
    }

    const result = await addCatalogMovement({
      tx,
      catalogComponentId: comp.id,
      direction: "out",
      quantity: requiredQty,
      sourceType: "order_delivery",
      sourceId: saleId,
      orderComponentId: c.id,
      notes,
      unitCostCents,
      totalValueCents,
      // requestId نفسه لكل حركة ضمن الـ transaction نفسها — لكن idempotency_key
      // مفتاحه الأساسي requestId، فلا يمكن تكراره. نُمرّر undefined لتجنب التضارب
      // مع المفتاح الذي سجّله convertOrderToSale نفسه. convertOrderToSale مسؤول
      // عن idempotency على مستوى الـ transaction كاملاً.
      requestId: undefined,
    });

    createdMovements.push({
      id: result.id,
      catalogComponentId: comp.id,
      orderComponentId: c.id,
      quantity: requiredQty,
      balanceBefore,
      balanceAfter: balanceBefore - requiredQty,
      unitCostCents,
    });
  }

  return createdMovements;
}

interface RestoreForReverseInput {
  tx: Tx;
  saleId: string;
  requestId?: string;
}

/**
 * استرجاع حركات المخزون المرتبطة بمبيعة عند عكس التحويل (reverseSale).
 *
 * المنطق: soft-delete كل صف في catalog_movement WHERE source_type='order_delivery'
 * AND source_id=saleId AND deleted_at IS NULL. لا حذف صلب (INV-5). يُحافِظ على
 * الأثر التاريخي للأرشفة.
 *
 * Atomicity: تُستدعى داخل transaction reverseSale. أي فشل يُلغي الكل.
 */
export async function restoreForReverse(input: RestoreForReverseInput) {
  const { tx, saleId } = input;

  // تأكّد أن المبيعة موجودة (دفاعياً — reverseSale تحقّقت مسبقاً).
  const [saleRow] = await tx
    .select({ id: sale.id })
    .from(sale)
    .where(and(eq(sale.id, saleId), isNull(sale.deletedAt)))
    .limit(1);

  if (!saleRow) {
    // لا توجد مبيعة نشطة — لا شيء لاسترجاعه.
    return { restoredCount: 0 };
  }

  // soft-delete كل حركات order_delivery المرتبطة بـ saleId.
  const result = await tx
    .update(catalogMovement)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(catalogMovement.sourceType, "order_delivery"),
        eq(catalogMovement.sourceId, saleId),
        isNull(catalogMovement.deletedAt),
      ),
    )
    .returning({ id: catalogMovement.id });

  return { restoredCount: result.length };
}

interface AdjustStockInput {
  catalogComponentId: string;
  direction: "in" | "out";
  quantity: number;
  reason?: string;
  requestId?: string;
  // sourceType مُشتق من direction: 'in' → 'manual_in', 'out' → 'manual_out'.
  // ملاحظة: 'adjustment' متاح أيضاً لكن غير مُستخدَم من UI الافتراضي.
  sourceType?: "manual_in" | "manual_out" | "adjustment";
}

/**
 * تسوية يدوية للرصيد. لا تدخل P&L إطلاقاً (§6 سيناريو 11).
 * تُستخدم من CatalogClient "صرف يدوي" modal. transaction مستقلة (لا تُمرَّر tx).
 */
export async function adjustStock(
  input: AdjustStockInput,
): Promise<{ status: "ok"; data: { id: string } } | { status: "error"; message: string }> {
  const {
    catalogComponentId,
    direction,
    quantity,
    reason,
    requestId,
    sourceType,
  } = input;

  if (quantity <= 0) {
    return { status: "error", message: "الكمية يجب أن تكون موجبة" };
  }

  const effectiveSourceType =
    sourceType ?? (direction === "in" ? "manual_in" : "manual_out");

  try {
    return await db.transaction(async (tx) => {
      // تحقّق أن الصنف موجود ومتتبَّع.
      const [comp] = await tx
        .select({ id: catalogComponent.id, tracked: catalogComponent.tracked })
        .from(catalogComponent)
        .where(
          and(
            eq(catalogComponent.id, catalogComponentId),
            isNull(catalogComponent.deletedAt),
          ),
        )
        .for("update");

      if (!comp) {
        return { status: "error", message: "الصنف غير موجود" };
      }
      if (!comp.tracked) {
        return {
          status: "error",
          message: "الصنف غير متتبَّع — لا يمكن تسوية المخزون",
        };
      }

      // SA1 (A2 fix) — للحركة `out` (manual_out / adjustment)، احسب التكلفة
      // الوسطية المرجَّحة من كل الحركات `in` النشطة (نفس منطق deductForDelivery)
      // ومرِّرها كـ unitCostCents. كذلك احسب total_value_cents = qty × unitCostCents.
      // هذا يضمن أن قيمة المخزون تُخصَم من الميزانية (inventoryValueCents) عند
      // الصرف اليدوي — لا الكمية فقط. قبل هذا الإصلاح، unit_cost_cents كان NULL
      // → coalesce(unit_cost_cents, 0) = 0 → القيمة لا تُخصَم → الأصول مُضخَّمة.
      //
      // Edge case: لا حركات in (صنف متتبَّع بلا مخزون، ثم صرف يدوي) → unitCostCents = 0،
      // totalValueCents = 0 → لا قيمة لخصمها — صحيح (لا تكلُّفة دفترية).
      //
      // SA1 (A1 fix — Round 4) — للحركة `out` مع totalValueCents > 0، أُدرِج
      // في نفس الـ transaction صف expense بـ is_inventory_writeoff=true (خسارة
      // غير نقدية). computeOperatingPnl يقرؤه مباشرةً (لا عبر cash_movement)
      // كبند inventoryWriteOffCents، وgetFinancialPosition يخصمه من
      // retainedProfitCents لمطابقة inventoryValueCents الذي يخصم بنفس المقدار
      // من totalAssets. هكذا يبقى IC-1 = 0 والتوازن محفوظ. موثَّق في INV-25.
      //
      // SA1 (A4 fix — Round 4) — اكتسح الباقي الدفتري عند نفاد المخزون كلياً
      // (نفس منطق deductForDelivery).
      let unitCostCents: number | undefined;
      let totalValueCents: number | undefined;
      if (direction === "out") {
        const [costRow] = await tx
          .select({
            totalQty: sql<number>`coalesce(sum(${catalogMovement.quantity}), 0)::bigint`,
            totalCost: sql<number>`coalesce(sum(${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)), 0)::bigint`,
          })
          .from(catalogMovement)
          .where(
            and(
              eq(catalogMovement.catalogComponentId, catalogComponentId),
              eq(catalogMovement.direction, "in"),
              isNull(catalogMovement.deletedAt),
            ),
          );
        const totalQty = Number(costRow?.totalQty) || 0;
        const totalCost = Number(costRow?.totalCost) || 0;
        unitCostCents = totalQty > 0 ? Math.floor(totalCost / totalQty) : 0;
        totalValueCents = quantity * unitCostCents;

        // A4 fix — احسب bookValueBefore و balanceBefore. إن أخذت الحركة كل
        // الرصيد المتاح، اكتسب الباقي الدفتري لتفادي residual 1-fils.
        const [bvRow] = await tx
          .select({
            bookValue: sql<number>`coalesce(sum(
              case when ${catalogMovement.direction} = 'in'
                   then coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0))
                   else -(coalesce(${catalogMovement.totalValueCents}, ${catalogMovement.quantity} * coalesce(${catalogMovement.unitCostCents}, 0)))
              end
            ), 0)::bigint`,
          })
          .from(catalogMovement)
          .where(
            and(
              eq(catalogMovement.catalogComponentId, catalogComponentId),
              isNull(catalogMovement.deletedAt),
            ),
          );
        const bookValueBefore = Number(bvRow?.bookValue) || 0;
        const balanceBefore = await getTxComponentBalance(tx, catalogComponentId);
        if (quantity >= balanceBefore && bookValueBefore > (totalValueCents ?? 0)) {
          totalValueCents = bookValueBefore;
        }
      }

      const result = await addCatalogMovement({
        tx,
        catalogComponentId,
        direction,
        quantity,
        sourceType: effectiveSourceType,
        notes: reason ?? "",
        requestId,
        unitCostCents,
        totalValueCents,
      });

      // SA1 (A1 fix — Round 4) — أدرج صف expense بـ is_inventory_writeoff=true
      // للصرف اليدوي ذي القيمة (direction='out' مع totalValueCents > 0). هذا
      // يُنشئ قيداً مقابل في retainedProfitCents يُطابِق ما خُصِم من
      // inventoryValueCents. لا cash_movement (الخسارة غير نقدية — مثل COGS).
      // الـ transaction الواحد يضمن atomicity: فشل إدراج expense = rollback
      // حركة catalog_movement أيضاً.
      if (direction === "out" && totalValueCents && totalValueCents > 0) {
        const compRow = await tx
          .select({ name: catalogComponent.name })
          .from(catalogComponent)
          .where(eq(catalogComponent.id, catalogComponentId))
          .limit(1);
        const compName = compRow[0]?.name ?? "صنف غير معروف";
        const safeReason = (reason ?? "غير محدد").trim();
        await tx.insert(expense).values({
          date: getAmmanDate(),
          category: "هدر/تلف مخزون",
          amountCents: totalValueCents,
          description:
            `هدر/تلف مخزون: ${compName} (${quantity} وحدة) — السبب: ${safeReason}`,
          isCapitalAsset: false,
          costNature: "variable",
          isInventoryWriteoff: true,
        });
      }

      return { status: "ok", data: { id: result.id } };
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { status: "error", message: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// helper داخلي: رصيد صنف داخل tx معيّن (لاستخدامه في deductForDelivery).
// ─────────────────────────────────────────────────────────────────────────
async function getTxComponentBalance(tx: Tx, catalogComponentId: string): Promise<number> {
  const rows = await tx
    .select({
      direction: catalogMovement.direction,
      qty: catalogMovement.quantity,
    })
    .from(catalogMovement)
    .where(
      and(
        eq(catalogMovement.catalogComponentId, catalogComponentId),
        isNull(catalogMovement.deletedAt),
      ),
    );

  let balance = 0;
  for (const r of rows) {
    if (r.direction === "in") balance += r.qty;
    else balance -= r.qty;
  }
  return balance;
}
