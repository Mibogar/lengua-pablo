/* Service Worker (v5)
   - Core assets: stale-while-revalidate (carga rápido y se actualiza solo)
   - /data/*.json: network-first
*/

const CACHE = "lengua-pablo-v5";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // GitHub Pages base path
  const isApp = url.pathname.includes("/lengua-pablo/");

  if (!isApp) return;

  // DATA: network-first
  if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // CORE: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});
