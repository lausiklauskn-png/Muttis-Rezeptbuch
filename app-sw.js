// Service Worker for Muttis Rezeptbuch (Hauptapp)
const CACHE = 'mrz-v13';
const SHELL = [
  './index.html',
  './app-manifest.json',
  './icons/icon-book-blue-192.png',
  './icons/icon-book-blue-512.png',
  './icons/ausgeloest-c44ba03df3.png?v=1',
  './icons/icon-book-120.png?v=1',
  './icons/icon-book-144.png?v=1',
  './icons/icon-book-152.png?v=1',
  './icons/icon-book-180.png?v=1',
  './icons/icon-book-192.png?v=1',
  './icons/icon-book-72.png?v=1',
  './icons/icon-book-96.png?v=1',
  './icons/icon-book.svg?v=1',
  './icons/splash-1125x2436.png?v=1',
  './icons/splash-1170x2532.png?v=1',
  './icons/splash-1179x2556.png?v=1',
  './icons/splash-1242x2208.png?v=1',
  './icons/splash-1242x2688.png?v=1',
  './icons/splash-1284x2778.png?v=1',
  './icons/splash-1290x2796.png?v=1',
  './icons/splash-1536x2048.png?v=1',
  './icons/splash-2048x2732.png?v=1',
  './icons/splash-640x1136.png?v=1',
  './icons/splash-750x1334.png?v=1',
  './icons/splash-828x1792.png?v=1'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting(); // Sofort übernehmen – keine Wartezeit
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network-first: immer frische Version versuchen, Cache nur als Fallback
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() =>
      caches.match(e.request).then(r =>
        r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
      )
    )
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
