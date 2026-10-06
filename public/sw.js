// Offline support for the web / home-screen version (the Tauri apps don't use this).
// Pages: network first, so updates arrive when online. Everything else: cache first (Vite file names are hashed).
// ponytail: old hashed files stay cached after updates; add cleanup if storage ever matters
const CACHE = 'little-prince';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) ?? (await cache.match('./')) ?? Response.error();
      }
    }
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  }));
});
