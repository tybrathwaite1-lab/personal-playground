/* Personal Playground service worker — offline support, no build plugin required.
 *
 * Strategy
 *  - App shell (index.html): network-first, falling back to cache when offline.
 *  - Same-origin static files (hashed JS/CSS, icons): cache-first, filled at runtime.
 *  - Fonts are bundled same-origin, so they're covered by the rule above.
 *  - /data/*.json (daily Local Pulse listings): network, never served stale by the worker —
 *    the app keeps its own dated copy for offline use and labels it.
 *  - Map tiles, weather and geocoding always go to the network (they need a connection).
 *  - Everything else (external sites): untouched.
 *
 * Bump VERSION to force old caches to be cleared.
 */
const VERSION = 'v3';
const CACHE = `pp-${VERSION}`;
const SCOPE = self.registration.scope; // e.g. https://user.github.io/personal-playground/
const SHELL = [SCOPE, `${SCOPE}index.html`, `${SCOPE}manifest.webmanifest`, `${SCOPE}icons/icon-192.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(`${SCOPE}index.html`, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(`${SCOPE}index.html`)) || (await cache.match(SCOPE)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && request.url.startsWith(SCOPE)) {
    event.respondWith(networkFirst(request));
    return;
  }
  // Daily data (Local Pulse listings): always try the network so listings are never silently stale.
  if (url.origin === self.location.origin && url.pathname.includes('/data/')) {
    event.respondWith(fetch(request).catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || Response.error())));
    return;
  }
  if (url.origin === self.location.origin && request.url.startsWith(SCOPE)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request));
  }
});
