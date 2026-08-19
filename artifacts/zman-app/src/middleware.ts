import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // استثناء مسارات النظام والمصادر الثابتة وصفحة تسجيل الدخول
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/login" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  ) {
    return NextResponse.next();
  }

  // قراءة الرمز السري من الكوكيز
  const session = request.cookies.get("zman_session")?.value;
  const expectedPasscode = process.env.PASSCODE;

  // الإغلاق الآمن: رفض الدخول إذا لم يُعيَّن PASSCODE في البيئة
  if (!expectedPasscode) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // التوجيه إلى صفحة تسجيل الدخول إذا كان الرمز غير متطابق
  if (session !== expectedPasscode) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // مطابقة كل المسارات لتأمين التطبيق بالكامل
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
