// Learning Quest service worker — offline-first for the app shell only.
// Cloud sync (your self-hosted server) is intentionally NEVER cached or intercepted here:
// it must always hit the real network or fail cleanly, exactly like the
// app's own cloudSync() already handles (fire-and-forget, local-first).
// Bump CACHE_VERSION whenever index.html/admin.html/docs.html/icons change so old
// clients pick up the new files instead of serving a stale cached copy.
const CACHE_VERSION = "lq-v2";
const APP_SHELL = [
  "/",
  "/index.html",
  "/admin.html",
  "/docs.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever handle GET requests to our own origin. Everything else
  // (sync-server API calls, any POST, cross-origin fonts, etc.) is left
  // completely alone — the browser handles it as if no service worker
  // existed, so cloud sync behavior is unaffected online or offline.
  if (req.method !== "GET" || !isSameOrigin(req.url)) return;

  const url = new URL(req.url);
  const isAppShellFile = APP_SHELL.some((p) => url.pathname === p || (p === "/" && url.pathname === "/index.html"));
  if (!isAppShellFile) return; // don't intercept anything not explicitly part of the shell

  // Stale-while-revalidate: serve the cached copy instantly (works offline),
  // and refresh the cache from the network in the background when online.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached); // offline and nothing new — fall back to cache
        return cached || networkFetch;
      })
    )
  );
});
