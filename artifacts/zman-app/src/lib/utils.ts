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
