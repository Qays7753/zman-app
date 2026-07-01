ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deposit_cents" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "deposit_date" date;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_deposit_nonnegative') THEN
    ALTER TABLE "order" ADD CONSTRAINT "order_deposit_nonnegative" CHECK ("deposit_cents" >= 0);
  END IF;
END $$;
