/* Oddiy oflayn kesh: avval tarmoq, internet bo'lmasa saqlangan nusxa. Narxlar keshlanmaydi. */
const C = "nps-v61";
const SHELL = ["./", "index.html", "engine.js", "i18n.js", "app.js", "manifest.webmanifest", "img/ikonka.jpg", "img/emblema.jpg", "img/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("news.json")) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
