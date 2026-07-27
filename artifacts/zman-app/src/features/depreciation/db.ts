import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────
// capital_asset — جدول الأصول الرأسمالية المُهلَكة (Phase 4)
// ─────────────────────────────────────────────────────────────────────────
// جدول مستقل لتسجيل قرار الإهلاك لكل تكلفة رأسمالية (آلة، أثاث، معدات). عند
// إنشاء صف هنا، يبدأ النظام بخصم monthly_depreciation_cents شهرياً من الربح
// التشغيلي عبر computeOperatingPnl (محسوب عند القراءة — خيار γ).
//
// العلاقة مع expense/purchase (Phase 2):
//   - expense/purchase لهما is_capital_asset (boolean) يُحدِّد أن الصف رأسمالي.
//   - capital_asset يُخزِّن قرار الإهلاك لصف رأسمالي محدَّد (اختياري — لا يُنشأ
//     تلقائياً؛ يطلبه المستخدم صراحةً عبر toggle «تصنيف متقدّم»).
//   - الربط عبر (source_type, source_id) — لا FK صريح، نمط catalog_movement.
//     يحافظ على إمكانية حذف expense/purchase لاحقاً دون كسر FK؛ capital_asset
//     يبقى للسجل التاريخي.
//
// الحقول الأساسية:
//   - sourceType / sourceId: مرجع للصف الأصلي (expense.id أو purchase.id).
//   - name: وصف الأصل للعرض في IC-14 والتقارير.
//   - purchaseDate: تاريخ الشراء الأصلي (للعرض فقط — لا يُستخدَم في حساب الإهلاك).
//   - purchaseAmountCents: قيمة الشراء بالـ fils (للعرض ولحساب netBookValue في IC-14).
//   - usefulLifeMonths: العمر النافع بالأشهر (CHECK > 0).
//   - monthlyDepreciationCents: = floor(purchaseAmountCents / usefulLifeMonths)
//     يُحسَب في addCapitalAsset (depreciation/actions.ts) ويُخزَّن هنا كعدد صحيح.
//   - startedAt: timestamptz NOT NULL DEFAULT now() — **تاريخ بداية الإهلاك**،
//     وهو لحظة إنشاء هذا الصف، **لا** تاريخ الشراء الأصلي. هذا اختيار مقصود:
//     الإهلاك يبدأ من قرار المستخدم، لا من تاريخ دفع الفاتورة (الذي قد يكون
//     قديماً). تاريخ الشراء الأصلي محفوظ في purchaseDate كحقل عرض فقط. هذا
//     يمنع سيناريو «اشتريت آلة قبل سنة ولم أُهلكها — النظام يُهلكها بأثر
//     رجعي 12 شهراً دفعة واحدة». بدلاً من ذلك: يبدأ الإهلاك من اليوم.
//
// الكتابة:
//   - فقط من addCapitalAsset في depreciation/actions.ts.
//
// الحذف الناعم:
//   - حالياً لا UI للحذف. الإهلاك يستمر حتى انقضاء العمر النافع. للحذف
//     المستقبلي: deleted_at = now() (نمط INV-5).
// ─────────────────────────────────────────────────────────────────────────

export const capitalAsset = pgTable(
  "capital_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceType: text("source_type").notNull(), // 'expense' | 'purchase'
    sourceId: uuid("source_id").notNull(),
    name: text("name").notNull(),
    purchaseDate: date("purchase_date").notNull(),
    purchaseAmountCents: integer("purchase_amount_cents").notNull(),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    monthlyDepreciationCents: integer("monthly_depreciation_cents").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "capital_asset_source_type_enum",
      sql`${t.sourceType} in ('expense','purchase')`,
    ),
    check("capital_asset_useful_life_positive", sql`${t.usefulLifeMonths} > 0`),
    check(
      "capital_asset_amount_nonnegative",
      sql`${t.purchaseAmountCents} >= 0`,
    ),
    check(
      "capital_asset_monthly_dep_nonnegative",
      sql`${t.monthlyDepreciationCents} >= 0`,
    ),
    check("capital_asset_name_length", sql`char_length(${t.name}) <= 200`),
    // فهرس (source_type, source_id) WHERE deleted_at IS NULL — يُسرِّع البحث عن
    // capital_asset المرتبط بصف expense/purchase محدَّد.
    index("capital_asset_source_idx")
      .on(t.sourceType, t.sourceId)
      .where(sql`deleted_at IS NULL`),
    // فهرس started_at WHERE deleted_at IS NULL — يُسرِّع استعلام الإهلاك في
    // computeOperatingPnl و IC-14.
    index("capital_asset_started_at_idx")
      .on(t.startedAt)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type CapitalAsset = typeof capitalAsset.$inferSelect;
export type NewCapitalAsset = Omit<
  typeof capitalAsset.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "deletedAt" | "startedAt"
>;
