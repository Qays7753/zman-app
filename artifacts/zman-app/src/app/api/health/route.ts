import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * مسار الإحماء وفحص الصحة (المرحلة 4) — GET /api/health
 *
 * يُنفّذ استعلام خفيف جداً (SELECT 1) لإبقاء اتصال قاعدة البيانات دافئاً ومنع
 * سبات Supabase (تجنب الاتصال البارد الذي يستغرق ~1,320ms).
 *
 * معايير الأمان والحيادية:
 * 1. لا يتطلب تسجيل دخول (مستثنى في middleware.ts ليعمل عبر الـ Cron الخارجي).
 * 2. لا يكشف أي بيانات أو أرقام أو تفاصيل بيئة ({ status: "ok" } فقط).
 * 3. محايد المنصة تماماً (Next.js Route Handler قياسي بدون أي تبعيات لمنصة محددة).
 */
export async function GET() {
  try {
    const { db } = await import("@/lib/db/client");
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
