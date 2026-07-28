"use server";

import { cookies } from "next/headers";

export async function loginAction(passcode: string) {
  const expectedPasscode = process.env.PASSCODE;
  if (!expectedPasscode) {
    return { success: false, error: "خطأ في إعدادات الخادم" };
  }
  if (passcode === expectedPasscode) {
    const cookieStore = await cookies();
    cookieStore.set("zman_session", passcode, {
      httpOnly: true,
      // secure مشروطة بالبيئة: في الإنتاج (HTTPS على Vercel) تبقى true لأمان الكوكي؛
      // في التطوير تصبح false ليتمكّن المتصفّح من تخزين الكوكي على HTTP عبر IP الشبكة
      // المحلية (تجربة الهاتف عبر الواي فاي) — المتصفّح يرفض كوكي secure على HTTP لأي
      // عنوان غير localhost. راجع §4 في CLAUDE.md.
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 8, // 8 ساعات (طبقة أمان ثانية؛ القفل عند الخمول يعمل قبلها)
      path: "/",
    });
    return { success: true };
  }
  return { success: false, error: "رمز الدخول غير صحيح" };
}

/** تسجيل الخروج — يحذف كوكي الجلسة (يُستدعى عند القفل بالخمول أو يدوياً) */
export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("zman_session");
  return { success: true };
}
