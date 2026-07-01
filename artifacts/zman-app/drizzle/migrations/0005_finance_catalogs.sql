CREATE TABLE IF NOT EXISTS "purchase_item_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "purchase_item_catalog_name_length" CHECK (char_length("purchase_item_catalog"."name") <= 200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expense_category_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "expense_category_catalog_name_length" CHECK (char_length("expense_category_catalog"."name") <= 200)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_item_catalog_name_idx" ON "purchase_item_catalog" USING btree ("name") WHERE deleted_at is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_category_catalog_name_idx" ON "expense_category_catalog" USING btree ("name") WHERE deleted_at is null;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'purchase_item_catalog_set_updated_at') THEN
    CREATE TRIGGER purchase_item_catalog_set_updated_at
      BEFORE UPDATE ON "purchase_item_catalog"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'expense_category_catalog_set_updated_at') THEN
    CREATE TRIGGER expense_category_catalog_set_updated_at
      BEFORE UPDATE ON "expense_category_catalog"
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
