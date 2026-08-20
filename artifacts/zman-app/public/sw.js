// Service worker خفيف لتثبيت التطبيق وتحديثه بأمان.
// لا توجد قائمة precache؛ النظام network-first بطبيعته ويتعامل مع البيانات عبر الخادم.

const VERSION = "zman-sw-v3-update-prompt";

self.addEventListener("install", () => {
  // ننتظر تأكيد المستخدم قبل استبدال الصفحة المفتوحة، حتى لا تضيع بيانات نموذج.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// الشبكة أولاً؛ لا نعود إلى cache قديم عند فشل الطلب.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const newRequest = new Request(event.request, { cache: "no-store" });
  event.respondWith(fetch(newRequest).catch(() => Response.error()));
});

void VERSION;
