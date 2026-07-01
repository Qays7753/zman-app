ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "delivery_date" date;
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS "received_date" date DEFAULT CURRENT_DATE NOT NULL;
