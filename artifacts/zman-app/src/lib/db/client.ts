import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  postgresClient: postgres.Sql | undefined;
};

// تهيئة العميل الموجه للسيرفر باستخدام Supavisor مع مُهلة اتصال وفترات خمول قصيرة لتفادي التعليق (ERR-2)
const client = globalForDb.postgresClient ?? postgres(env.DATABASE_URL, {
  prepare: false,
  // 10 لا 30: الاتصال العالق يحتجز مقعده في تجمّع Supavisor طوال المهلة،
  // فتُحرَم بقيّة الشاشات. الفشل السريع أفضل حين يكون المورد مشتركاً.
  connect_timeout: 10,
  idle_timeout: 30,
  // إعادة تدوير الاتصالات قبل أن ينهيها Supabase بعد الخمول؛ يمنع فشل أول طلب
  max_lifetime: 60 * 30,
});

if (process.env.NODE_ENV !== "production") globalForDb.postgresClient = client;

export const db = drizzle(client, { schema });
