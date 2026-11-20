// Keeps the app working offline and quick to open. Code: network first (updates arrive), pictures: cache first.
const VERSION = "ck-3";
const CORE = ["./", "index.html", "css/app.css", "js/app.js", "js/kitten.js", "js/link.js", "js/proto.js", "js/audio.js",
              "js/i18n.js", "vendor/mqtt.min.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.includes("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
});
