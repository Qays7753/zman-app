import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// تهيئة العميل الموجه للسيرفر باستخدام Supavisor مع مُهلة اتصال وفترات خمول قصيرة لتفادي التعليق (ERR-2)
const client = postgres(env.DATABASE_URL, {
  prepare: false,
  // 🔴 أُعيدت إلى 10 بعد أعطال 500 على الإنتاج (18 آب 2026).
  // رفعها إلى 30 في جولة الأداء جعل الاتصالات العالقة تحتجز مقاعدها في تجمّع
  // Supavisor ثلاثة أضعاف المدّة، فتُحرَم بقيّة الشاشات من اتصال. الفشل السريع
  // أفضل من الاحتجاز الطويل حين يكون المورد مشتركاً.
  connect_timeout: 10,
  idle_timeout: 30,
  // إعادة تدوير الاتصالات قبل أن ينهيها Supabase بعد الخمول؛ يمنع فشل أول طلب
  max_lifetime: 60 * 30,
});
export const db = drizzle(client, { schema });
