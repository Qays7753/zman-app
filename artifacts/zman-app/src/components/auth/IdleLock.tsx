"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { logoutAction } from "@/app/login/actions";

// مدة الخمول المسموحة قبل القفل (دقيقتان)
const IDLE_LIMIT_MS = 2 * 60 * 1000;
// مفتاح تخزين آخر وقت نشاط (يُشارك عبر التبويبات ويصمد عبر إعادة التحميل)
const LAST_ACTIVE_KEY = "zman_last_active";

/**
 * يقفل التطبيق عند العودة بعد خمول > دقيقتين (حتى على التطبيق المثبّت PWA).
 * الآلية: عند مغادرة التطبيق (إخفاء الصفحة) نسجّل الوقت؛ وعند العودة إن تجاوز
 * الغياب الحدّ، نسجّل خروجاً (حذف الكوكي) ونوجّه لصفحة الدخول.
 * نعتمد على visibilitychange (يعمل عند تبديل التطبيقات/قفل الشاشة على الجوال).
 */
export function IdleLock() {
  const router = useRouter();
  const lockingRef = useRef(false);

  useEffect(() => {
    const markActive = () => {
      try {
        localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      } catch {
        // تجاهل — بعض المتصفحات تمنع التخزين في الخصوصية
      }
    };

    const lock = async () => {
      if (lockingRef.current) return;
      lockingRef.current = true;
      try {
        localStorage.removeItem(LAST_ACTIVE_KEY);
      } catch {
        // ignore
      }
      try {
        await logoutAction();
      } catch {
        // حتى لو فشل الحذف على السيرفر، نوجّه للدخول
      }
      router.replace("/login");
      router.refresh();
    };

    const checkIdle = () => {
      let last = 0;
      try {
        last = Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0;
      } catch {
        last = 0;
      }
      if (last && Date.now() - last > IDLE_LIMIT_MS) {
        void lock();
      } else {
        markActive();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        markActive(); // سجّل وقت المغادرة
      } else {
        checkIdle(); // عند العودة: افحص المدة
      }
    };

    // نشاط أوّلي + عند التحميل نفحص (لو عاد بعد إعادة فتح التطبيق)
    checkIdle();
    document.addEventListener("visibilitychange", handleVisibility);
    // تحديث وقت النشاط دورياً أثناء الاستخدام النشط
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") markActive();
    }, 30 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
