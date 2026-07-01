ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "customer_phone_alt" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_phone_alt_length') THEN
    ALTER TABLE "order" ADD CONSTRAINT "customer_phone_alt_length" CHECK (char_length("order"."customer_phone_alt") <= 32);
  END IF;
END $$;
