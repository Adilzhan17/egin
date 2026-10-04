/* Cache only public application code. Private API/media and map tiles are never
 * intercepted: account-specific offline records live in partitioned IndexedDB. */
const CACHE = "egin-shell-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"])));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("egin-shell-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put("/", response.clone()); }
      return response;
    }).catch(async () => (await caches.match("/")) || Response.error()));
  } else if (url.pathname.startsWith("/_next/static/") || ["/icon.svg", "/manifest.webmanifest"].includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }));
  }
});
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_ASSETS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(value => { try { const url = new URL(value); return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"); } catch { return false; } });
  event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(urls.map(async url => { if (!await cache.match(url)) await cache.add(url); }))));
});
// Delivery can be wired to a configured Web Push provider later. No permission
// request or subscription is created automatically at first visit.
self.addEventListener("push", event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload?.title) return;
  event.waitUntil(self.registration.showNotification(String(payload.title).slice(0, 200), {
    body: String(payload.body || "Откройте EGIN для подробностей.").slice(0, 500),
    icon: "/icon-192.png", tag: payload.id ? "egin-" + String(payload.id) : undefined,
    data: { url: payload.url || "/more" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  let url;
  try { url = new URL(event.notification.data?.url || "/more", self.location.origin); } catch { return; }
  if (url.origin !== self.location.origin) url = new URL("/more", self.location.origin);
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (client) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
