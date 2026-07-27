import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * دمج فئات Tailwind مع حل التضاربات تلقائياً
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * دالة لتأخير التنفيذ (مفيدة للاختبار والمحاكاة)
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * يُرجع تاريخ اليوم بصيغة YYYY-MM-DD بتوقيت Asia/Amman.
 */
export function getAmmanDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
}

/**
 * تحويل تاريخ مدخل إلى صيغة YYYY-MM-DD بتوقيت Asia/Amman.
 */
export function formatAmmanDate(date: Date | string | number): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
}

/**
 * حدود الشهر عمّان-anchored (D8 fix — timezone-aware month bounds).
 *
 * Vercel وغيره من مزوّدي الاستضافة يُشغِّلون العمليات بتوقيت UTC، بينما غرّة
 * العمل في عمّان هي UTC+3. حساب حدود «الشهر الحالي» من `new Date()` المجرَّد
 * (server-local) يُنتج تواريخ خاطئة لمدة تصل إلى 3 ساعات حول كل منتصف شهر:
 * مثلاً 21:00 UTC في 2025-01-31 = 00:00 عمّان في 2025-02-01. لو سألنا
 * `new Date()` عن «أي شهر نحن فيه؟» لقال «يناير»، بينما الإجابة الصحيحة لعمّان
 * هي «فبراير». هذا الفرق يُسبِّب فشلاً وهمياً في IC-13 الذي يقارن نتيجة
 * `getMonthlyProfit` (server-local) مع `computeCashBasisPnl("month")` (Amman-tz).
 *
 * هذه الدالة الموحَّدة تُرجِع:
 *   - start: أول لحظة في الشهر الحالي بتوقيت عمّان، كـ Date UTC (Y-M-D 00:00:00Z
 *     لليوم الأول من الشهر).
 *   - end: آخر لحظة في الشهر الحالي بتوقيت عمّان، كـ Date UTC.
 *   - monthKey: "YYYY-MM" (يُستعمل في تسميات اللوحة الشهرية).
 *
 * الاستعمال: في كل مكان نحتاج فيه حدود «الشهر الحالي»، نمرّر النتيجة هنا بدل
 * `new Date(now.getFullYear(), now.getMonth() - i, 1)`.
 */
export function getAmmanMonthBounds(
  now: Date = new Date(),
): { start: Date; end: Date; monthKey: string } {
  // التاريخ التقويمي لعمّان (Y-M-D) في لحظة `now`.
  const ammanYmd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
  const [yearStr, monthStr] = ammanYmd.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1..12

  // أول لحظة في الشهر بتوقيت عمّان. Date.UTC يبني تاريخاً UTC خالصاً، وبما أن
  // النص الأصلي معبِّر عن تاريخ عمّان التقويمي، فإن استعماله كـ UTC يُعطي
  // قيمة «منتصف الليل UTC» تطابق منتصف الليل المحلي في عمّان من حيث الرقم
  // التقويمي. هذا مقصود: مقارنات التواريخ في DB تستعمل YYYY-MM-DD (date only)،
  // فلا حاجة لـ tz-offset دقيقة على المستوى الثواني.
  const start = new Date(Date.UTC(year, month - 1, 1));

  // آخر يوم في الشهر: عدد الأيام = اليوم الأول من الشهر التالي ناقص يوم.
  const lastDayNum = new Date(year, month, 0).getDate();
  const end = new Date(Date.UTC(year, month - 1, lastDayNum));

  const monthKey = `${yearStr}-${monthStr}`;
  return { start, end, monthKey };
}
