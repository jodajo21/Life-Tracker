// Keeps the app opening instantly and offline. The page and its helpers are fetched fresh when you are online and served from the cache when you are not.
// Your data is never cached here: the app keeps its own copy and syncs it (see claude-shim.js).
const V = 'orrery-v1';
const SHELL = ['/', '/claude-shim.js', '/manifest.webmanifest', '/icon-180.png', '/icon-192.png', '/icon-512.png', '/vendor/jspdf.umd.min.js'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(V).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('/'))));
});
