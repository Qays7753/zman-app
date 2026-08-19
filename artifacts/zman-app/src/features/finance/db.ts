import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";
import { order } from "../orders/db";
// Phase 3 — value import من catalog/db (leaf module، لا دورة استيراد). يتيح
// إضافة linkedCatalogComponentId على purchase ( FK ON DELETE RESTRICT). نفس
// النمط المُتَّبع في orders/db.ts للـ catalogComponentId على order_component.
import { catalogComponent } from "../catalog/db";

// 1. Purchase Table
export const purchase = pgTable(
  "purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    item: text("item").notNull(),
    supplier: text("supplier").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    // سعر الوحدة (fils صحيح) — للعرض والتوافق فقط. مشتقّ من الدقّة العالية.
    unitCostCents: integer("unit_cost_cents").notNull(),
    // سعر الوحدة عالي الدقّة بالميلي-fils (fils×1000 = 6 منازل عشرية للدينار).
    // هو المصدر الأساسي: يضمن أن (فردي × كمية = إجمالي) دائماً دون فقدان الكسر.
    unitCostMicroCents: bigint("unit_cost_micro_cents", { mode: "number" })
      .notNull()
      .default(0),
    // الإجمالي (fils صحيح) محسوب من الدقّة العالية ومقرّب لأقرب fils.
    totalCents: integer("total_cents")
      .generatedAlwaysAs(
        () => sql`round(unit_cost_micro_cents::numeric * quantity / 1000)::integer`,
      )
      .notNull(),
    notes: text("notes").notNull().default(""),
    // Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر).
    // isCapitalAsset: افتراضي false (الصفوف القديمة كلها تشغيلية). costNature
    // nullable — NULL مقبول للرأسمالي (لا معنى لطبيعته) وللصفوف القديمة غير
    // المُصنَّفة صراحةً. CHECK في migration 0018 يفرض المنطق.
    isCapitalAsset: boolean("is_capital_asset").notNull().default(false),
    costNature: text("cost_nature"),
    // Phase 3 — ربط اختياري بصنف الكتالوج (card 3.A/3.B). إن كان الصنف متتبَّعاً
    // (tracked=true)، تُنشئ createPurchase/updatePurchase حركة `in` في
    // catalog_movement. العمود nullable — الفواتير القديمة بلا ربط تبقى صالحة.
    // ON DELETE RESTRICT يُحافِظ على الأثر التاريخي (نمط order_component).
    linkedCatalogComponentId: uuid("linked_catalog_component_id").references(
      () => catalogComponent.id,
      { onDelete: "restrict" },
    ),
    // Phase 3-revised (D4 fix) — علم رأسمَلة المخزون. يُضبَط تلقائياً على true
    // إن كان linkedCatalogComponentId يشير لصنف متتبَّع (tracked=true). عند true،
    // تُستبعَد حركة الصندوق (sourceType='purchase') من operatingPurchasesCents في
    // computeOperatingPnl (الشراء يُرأسمَل كمخزون، لا يخفض الربح التشغيلي)؛
    // التكلفة تُخصَم عند البيع عبر COGS محسوب من catalog_movement out. أنموذج
    // is_capital_asset من Phase 2 هو النمط المُتَّبع هنا (افتراضي false،
    // COALESCE في PnL لمعالجة الصفوف القديمة).
    isTrackedInventory: boolean("is_tracked_inventory").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("purchase_item_length", sql`char_length(${table.item}) <= 200`),
      check(
        "purchase_supplier_length",
        sql`char_length(${table.supplier}) <= 200`,
      ),
      check("purchase_quantity_positive", sql`${table.quantity} > 0`),
      check("purchase_unit_cost_nonnegative", sql`${table.unitCostCents} >= 0`),
      check("purchase_notes_length", sql`char_length(${table.notes}) <= 1000`),
      // Phase 2 — CHECK التصنيف (موسَّع لقبول NULL عند is_capital=false ليتسق
      // مع backfill الافتراضي للصفوف القديمة — انظر CRITICAL-NOTE-1 في migration 0018).
      check(
        "purchase_classification_check",
        sql`${table.isCapitalAsset} = true OR ${table.costNature} IS NULL OR ${table.costNature} IN ('fixed','variable')`,
      ),
      index("purchase_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("purchase_supplier_idx")
        .on(table.supplier)
        .where(sql`deleted_at is null`),
      index("purchase_capital_idx")
        .on(table.isCapitalAsset)
        .where(sql`deleted_at is null`),
      // Phase 3 — فهرس جزئي على linked_catalog_component_id للفواتير المرتبطة فقط.
      index("purchase_linked_catalog_idx")
        .on(table.linkedCatalogComponentId)
        .where(sql`linked_catalog_component_id IS NOT NULL AND deleted_at IS NULL`),
    ];
  },
);

// 2. Expense Table
export const expense = pgTable(
  "expense",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull().default(""),
    // Phase 2 — التصنيف بُعدين: رأسمالي؟ + طبيعة (ثابت/متغيّر). نفس منطق purchase.
    isCapitalAsset: boolean("is_capital_asset").notNull().default(false),
    costNature: text("cost_nature"),
    // SA1 (Round 4 — A-1 fix) — علم «هدر/تلف مخزون غير نقدي». يُضبَط على true
    // فقط من adjustStock (direction='out' مع totalValueCents > 0) داخل نفس
    // transaction حركة catalog_movement `out`. لا تُنشَأ لها cash_movement —
    // الخسارة غير نقدية (مثل COGS). computeOperatingPnl يقرأ المصاريف بهذا
    // العلم مباشرةً (لا عبر cash_movement) كبند مستقل inventoryWriteOffCents
    // يُخصم من operatingNetCents. getFinancialPosition يخصم cumulative-to-date
    // من retainedProfitCents ليبقى IC-1 = 0. موثَّق في INV-25 / §9 من
    // ACCOUNTING_RULES.md.
    isInventoryWriteoff: boolean("is_inventory_writeoff")
      .notNull()
      .default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check(
        "expense_category_length",
        sql`char_length(${table.category}) <= 200`,
      ),
      check("expense_amount_nonnegative", sql`${table.amountCents} >= 0`),
      check(
        "expense_description_length",
        sql`char_length(${table.description}) <= 1000`,
      ),
      // Phase 2 — CHECK التصنيف (موسَّع لقبول NULL عند is_capital=false).
      check(
        "expense_classification_check",
        sql`${table.isCapitalAsset} = true OR ${table.costNature} IS NULL OR ${table.costNature} IN ('fixed','variable')`,
      ),
      index("expense_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("expense_category_idx")
        .on(table.category)
        .where(sql`deleted_at is null`),
      index("expense_capital_idx")
        .on(table.isCapitalAsset)
        .where(sql`deleted_at is null`),
      // SA1 (Round 4 — A-1 fix) — فهرس جزئي على is_inventory_writeoff=true
      // يُسرِّع computeOperatingPnl.inventoryWriteOffCents و
      // getFinancialPosition.inventoryWriteOffCentsToDate.
      index("expense_inventory_writeoff_idx")
        .on(table.isInventoryWriteoff, table.date)
        .where(sql`is_inventory_writeoff = true AND deleted_at IS NULL`),
    ];
  },
);

// 3. Sale Table
export const sale = pgTable(
  "sale",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    source: text("source").notNull(), // 'manual' | 'order'
    orderId: uuid("order_id").references(() => order.id), // Plain reference to retain audit trail
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("sale_source_length", sql`char_length(${table.source}) <= 32`),
      check("sale_source_enum", sql`${table.source} in ('manual','order')`),
      check("sale_amount_nonnegative", sql`${table.amountCents} >= 0`),
      check(
        "sale_description_length",
        sql`char_length(${table.description}) <= 1000`,
      ),
      // مؤشر فريد يمنع تكرار تحويل نفس الطلب إلى مبيعات (§5.3)
      uniqueIndex("sale_order_id_unique_idx")
        .on(table.orderId)
        .where(sql`order_id is not null and deleted_at is null`),
      index("sale_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
      index("sale_source_idx").on(table.source).where(sql`deleted_at is null`),
    ];
  },
);

// 4. Purchase Item Catalog Table
export const purchaseItemCatalog = pgTable(
  "purchase_item_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("purchase_item_catalog_name_length", sql`char_length(${table.name}) <= 200`),
    index("purchase_item_catalog_name_idx")
      .on(table.name)
      .where(sql`deleted_at is null`),
  ],
);

export type PurchaseItemCatalog = typeof purchaseItemCatalog.$inferSelect;
export type NewPurchaseItemCatalog = Pick<PurchaseItemCatalog, "name">;

// 5. Expense Category Catalog Table
export const expenseCategoryCatalog = pgTable(
  "expense_category_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("expense_category_catalog_name_length", sql`char_length(${table.name}) <= 200`),
    index("expense_category_catalog_name_idx")
      .on(table.name)
      .where(sql`deleted_at is null`),
  ],
);

export type ExpenseCategoryCatalog = typeof expenseCategoryCatalog.$inferSelect;
export type NewExpenseCategoryCatalog = Pick<ExpenseCategoryCatalog, "name">;

// 6. Account Table (الصناديق والحسابات البنكية)
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'cash' | 'bank'
    isArchived: boolean("is_archived").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("account_name_length", sql`char_length(${table.name}) <= 200`),
      check("account_type_enum", sql`${table.type} in ('cash', 'bank')`),
      index("account_type_idx")
        .on(table.type)
        .where(sql`deleted_at is null`),
      uniqueIndex("account_default_cash_unique_idx")
        .on(table.name)
        .where(sql`type = 'cash' AND name = 'الصندوق الرئيسي' AND deleted_at IS NULL`),
    ];
  },
);

export type Account = typeof account.$inferSelect;

// 7. Cash Movement Table (حركات الصندوق والبنك)
export const cashMovement = pgTable(
  "cash_movement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    direction: text("direction").notNull(), // 'in' | 'out'
    amountCents: integer("amount_cents").notNull(),
    // deposit direction='in' = تحصيل العربون، وdirection='out' = ردّه؛
    // كلاهما مرتبط بالطلب نفسه للحفاظ على أثر نقدي قابل للتدقيق دون migration جديدة.
    sourceType: text("source_type").notNull(), // 'sale' | 'expense' | 'purchase' | 'deposit' | 'owner_draw' | 'owner_inject' | 'opening' | 'transfer' | 'receivable' | 'receivable_payment'
    sourceId: uuid("source_id"),
    description: text("description").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("cash_movement_direction_enum", sql`${table.direction} in ('in', 'out')`),
      check("cash_movement_amount_positive", sql`${table.amountCents} > 0`),
      check(
        "cash_movement_source_type_enum",
        sql`${table.sourceType} in ('sale', 'expense', 'purchase', 'deposit', 'owner_draw', 'owner_inject', 'opening', 'transfer', 'receivable', 'receivable_payment')`,
      ),
      check(
        "cash_movement_description_length",
        sql`char_length(${table.description}) <= 1000`,
      ),
      index("cash_movement_account_date_idx")
        .on(table.accountId, table.date.desc())
        .where(sql`deleted_at is null`),
      index("cash_movement_source_idx")
        .on(table.sourceType, table.sourceId)
        .where(sql`deleted_at is null`),
      index("cash_movement_date_direction_idx")
        .on(table.date.desc(), table.direction)
        .where(sql`deleted_at is null`),
      index("cash_movement_source_type_date_idx")
        .on(table.sourceType, table.date.desc())
        .where(sql`deleted_at is null`),
    ];
  },
);

export type CashMovement = typeof cashMovement.$inferSelect;

// 8. Owner Transaction Table (سحوبات وايداعات المالك)
export const ownerTransaction = pgTable(
  "owner_transaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    type: text("type").notNull(), // 'draw' | 'inject'
    amountCents: integer("amount_cents").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    reason: text("reason").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("owner_transaction_type_enum", sql`${table.type} in ('draw', 'inject')`),
      check("owner_transaction_amount_positive", sql`${table.amountCents} > 0`),
      check(
        "owner_transaction_reason_length",
        sql`char_length(${table.reason}) <= 1000`,
      ),
      index("owner_transaction_date_idx")
        .on(table.date.desc())
        .where(sql`deleted_at is null`),
    ];
  },
);

export type OwnerTransaction = typeof ownerTransaction.$inferSelect;

// 9. Opening Balance Table (الأرصدة الافتتاحية للمشروع)
export const openingBalance = pgTable(
  "opening_balance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goLiveDate: date("go_live_date").notNull(),
    cashCents: integer("cash_cents").notNull(),
    bankCents: integer("bank_cents").notNull(),
    capitalCents: integer("capital_cents").notNull(),
    isLocked: boolean("is_locked").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return [
      check("opening_balance_cash_nonnegative", sql`${table.cashCents} >= 0`),
      check("opening_balance_bank_nonnegative", sql`${table.bankCents} >= 0`),
      check("opening_balance_capital_nonnegative", sql`${table.capitalCents} >= 0`),
    ];
  },
);

export type OpeningBalance = typeof openingBalance.$inferSelect;

// 10. Receivable Table (الذمم المدينة / الديون النقدية للأشخاص)
export const receivable = pgTable(
  "receivable",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    personName: text("person_name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    notes: text("notes").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("receivable_person_name_length", sql`char_length(${table.personName}) <= 200`),
    check("receivable_amount_positive", sql`${table.amountCents} > 0`),
    check("receivable_notes_length", sql`char_length(${table.notes}) <= 1000`),
    index("receivable_date_idx")
      .on(table.date.desc())
      .where(sql`deleted_at is null`),
    index("receivable_person_name_idx")
      .on(table.personName)
      .where(sql`deleted_at is null`),
    index("receivable_account_id_idx")
      .on(table.accountId)
      .where(sql`deleted_at is null`),
  ],
);

export type Receivable = typeof receivable.$inferSelect;
export type NewReceivable = typeof receivable.$inferInsert;

// 11. Receivable Payment Table (دفعات سداد الديون النقدية)
export const receivablePayment = pgTable(
  "receivable_payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    receivableId: uuid("receivable_id")
      .notNull()
      .references(() => receivable.id, { onDelete: "restrict" }),
    date: date("date").notNull().default(sql`CURRENT_DATE`),
    amountCents: integer("amount_cents").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "restrict" }),
    notes: text("notes").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("receivable_payment_amount_positive", sql`${table.amountCents} > 0`),
    check("receivable_payment_notes_length", sql`char_length(${table.notes}) <= 1000`),
    index("receivable_payment_receivable_id_idx")
      .on(table.receivableId)
      .where(sql`deleted_at is null`),
    index("receivable_payment_date_idx")
      .on(table.date.desc())
      .where(sql`deleted_at is null`),
    index("receivable_payment_account_id_idx")
      .on(table.accountId)
      .where(sql`deleted_at is null`),
  ],
);

export type ReceivablePayment = typeof receivablePayment.$inferSelect;
export type NewReceivablePayment = typeof receivablePayment.$inferInsert;

