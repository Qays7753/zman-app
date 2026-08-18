// Service worker خفيف — غرضه الوحيد جعل التطبيق "قابلاً للتثبيت" (PWA installable)
// حتى يظهر زر التثبيت (beforeinstallprompt يحتاج SW فعّالاً + manifest صحيح).
//
// لا precache لملفات محدّدة (كان ذلك سبب أخطاء 404/bad-precaching-response سابقاً
// بعد كل نشر). هذا SW لا يخزّن قوائم ملفات ثابتة، فلا يتعطّل عند النشر الجديد.
// الشبكة أولاً دائماً؛ لا offline caching معقّد — النظام أونلاين بطبيعته.

const VERSION = "zman-sw-v2-cache-bust";

self.addEventListener("install", () => {
  // فعّل النسخة الجديدة فوراً دون انتظار إغلاق كل التبويبات
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // حذف كل كاش سابق تماماً لضمان عدم بقاء أي ملفات قديمة
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// معالج fetch بسيط: الشبكة أولاً، لا نعود للكاش أبداً لأن التطبيق يتحدث باستمرار.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  
  // إضافة headers لمنع التخزين المؤقت من المتصفح في ملفات next
  const newRequest = new Request(event.request, {
    cache: "no-store"
  });

  event.respondWith(fetch(newRequest).catch(() => Response.error()));
});
