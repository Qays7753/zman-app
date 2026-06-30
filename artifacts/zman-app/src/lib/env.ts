import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// تنظيف القيمة من علامات الاقتباس المحيطة والمسافات الزائدة.
// بعض المنصّات (مثل Vercel) لا تجرّد الاقتباس تلقائياً كما تفعل ملفات .env،
// فإن لُصق الرابط مع " " يصبح URL غير صالح ويُفشل التحقق. هذا يمنع ذلك.
function unwrap(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "").trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: unwrap(process.env.DATABASE_URL),
    UPSTASH_REDIS_REST_URL: unwrap(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: unwrap(process.env.UPSTASH_REDIS_REST_TOKEN),
  },
  // تحويل السلاسل الفارغة تلقائياً إلى undefined ليمر التحقق الاختياري بسلام
  emptyStringAsUndefined: true,
});
