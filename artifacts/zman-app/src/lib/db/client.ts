import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// تهيئة العميل الموجه للسيرفر باستخدام Supavisor مع مُهلة اتصال وفترات خمول قصيرة لتفادي التعليق (ERR-2)
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  connect_timeout: 10,
  idle_timeout: 30,
  // @ts-expect-error postgres-js types may not include retry in Options
  retry: 1,
  // إعادة تدوير الاتصالات قبل أن ينهيها Supabase بعد الخمول؛ يمنع فشل أول طلب
  max_lifetime: 60 * 30,
});
export const db = drizzle(client, { schema });
