// Service Worker for Muttis Rezeptbuch – Handbuch
// Cache name: bump version string to force cache refresh on updates
const CACHE_NAME = 'handbuch-v1';
const ASSETS = [
  './handbuch.html',
  './manifest.json'
];

// ── Install ──────────────────────────────────────────────────────────────────
// Pre-cache all listed assets when the service worker is first installed.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets:', ASSETS);
      return cache.addAll(ASSETS);
    })
  );
  // Take control immediately without waiting for old SW to finish.
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
// Remove any outdated caches left behind by previous service worker versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Claim all open clients so the new SW takes effect without a page reload.
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
// Strategy: network-first with cache fallback.
//   1. Try to fetch the resource from the network.
//   2. On success → update the cache and return the fresh response.
//   3. On network failure → fall back to the cached version.
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests for our tracked assets.
  const url = new URL(event.request.url);
  const isTracked = ASSETS.some((asset) =>
    url.pathname.endsWith(asset.replace('./', '/'))
  );

  if (!isTracked || event.request.method !== 'GET') {
    return; // Let the browser handle everything else normally.
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Clone the response before consuming it – streams can only be read once.
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      })
      .catch(() => {
        // Network unavailable – serve from cache.
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache (offline):', event.request.url);
            return cachedResponse;
          }
          // Nothing cached either – return a minimal offline notice.
          return new Response(
            '<h1>Offline</h1><p>Das Handbuch ist im Cache nicht verfügbar.</p>',
            {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        });
      })
  );
});
