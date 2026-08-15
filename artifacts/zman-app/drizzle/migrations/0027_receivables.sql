-- ============================================================================
-- migration 0027 — جداول الذمم المدينة وسدادها (receivable & receivable_payment)
-- ============================================================================
-- يتيح تسجيل الديون النقدية للأشخاص وسدادها على دفعات بحرّية دون المساس بالربح
-- التشغيلي أو كسر توازن الميزانية (IC-1).
--
-- الدَّين ليس مصروفاً بل ذمّة مدينة (أصل).
-- عند الإقراض:  نقد out (−50)  ·  ذمم مدينة (+50)  ·  الربح لا يتغير
-- عند السداد:   نقد in  (+20)  ·  ذمم مدينة (−20)  ·  الربح لا يتغير
--
-- آمن للتشغيل المتكرر (idempotent): IF NOT EXISTS / DO $$
-- ============================================================================

CREATE TABLE IF NOT EXISTS "receivable" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "person_name" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "account_id" uuid NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "receivable_person_name_length" CHECK (char_length("person_name") <= 200),
  CONSTRAINT "receivable_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "receivable_notes_length" CHECK (char_length("notes") <= 1000)
);

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receivable_account_id_account_id_fk'
  ) THEN
    ALTER TABLE "receivable"
      ADD CONSTRAINT "receivable_account_id_account_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "public"."account"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_date_idx"
  ON "receivable" USING btree ("date" DESC)
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_person_name_idx"
  ON "receivable" USING btree ("person_name")
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_account_id_idx"
  ON "receivable" USING btree ("account_id")
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "receivable_payment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "receivable_id" uuid NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "amount_cents" integer NOT NULL,
  "account_id" uuid NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "receivable_payment_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "receivable_payment_notes_length" CHECK (char_length("notes") <= 1000)
);

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receivable_payment_receivable_id_receivable_id_fk'
  ) THEN
    ALTER TABLE "receivable_payment"
      ADD CONSTRAINT "receivable_payment_receivable_id_receivable_id_fk"
      FOREIGN KEY ("receivable_id") REFERENCES "public"."receivable"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receivable_payment_account_id_account_id_fk'
  ) THEN
    ALTER TABLE "receivable_payment"
      ADD CONSTRAINT "receivable_payment_account_id_account_id_fk"
      FOREIGN KEY ("account_id") REFERENCES "public"."account"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_payment_receivable_id_idx"
  ON "receivable_payment" USING btree ("receivable_id")
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_payment_date_idx"
  ON "receivable_payment" USING btree ("date" DESC)
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "receivable_payment_account_id_idx"
  ON "receivable_payment" USING btree ("account_id")
  WHERE (deleted_at IS NULL);

--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "cash_movement" DROP CONSTRAINT IF EXISTS "cash_movement_source_type_enum";
  ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_source_type_enum"
    CHECK ("source_type" in ('sale', 'expense', 'purchase', 'deposit', 'owner_draw', 'owner_inject', 'opening', 'transfer', 'receivable', 'receivable_payment'));
END $$;
