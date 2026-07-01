CREATE TABLE IF NOT EXISTS "message_template" (
  "key" text PRIMARY KEY,
  "template" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "template_length" CHECK (char_length("message_template"."template") <= 5000)
);
