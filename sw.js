/* RakshaCall service worker - network first, cache fallback. */
const BASE = new URL('.', self.location.href);
const asset = (path) => new URL(path, BASE).href;
const CACHE = 'rakshacall-shell-v5';
const CORE = [
  BASE.href,
  asset('index.html'),
  asset('manifest.webmanifest'),
  asset('favicon.svg'),
  asset('icons/icon-192.png'),
  asset('icons/icon-512.png'),
  asset('icons/icon-maskable-512.png'),
];

// Vite adds hashed JS/CSS names, so read the built index and cache whatever it
// references. This makes the very first online visit enough for an offline
// launch, instead of waiting for a second online page load.
async function precacheAppShell() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE);

  const indexUrl = asset('index.html');
  const response = await fetch(indexUrl, { cache: 'no-store' });
  if (!response.ok) return;

  await cache.put(indexUrl, response.clone());
  const html = await response.text();
  const assets = new Set();
  const tags = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(tags)) {
    const value = match[1];
    if (!value || value.startsWith('data:') || value.startsWith('#')) continue;
    const resolved = new URL(value, indexUrl);
    if (resolved.origin === self.location.origin) assets.add(resolved.href);
  }

  await Promise.all(
    [...assets].map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        /* Optional asset (for example an icon) - keep the core shell usable. */
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Do not cache the APK check or the APK itself.
  if (url.href.startsWith(asset('downloads/'))) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match(asset('index.html'));
          return Response.error();
        })
      )
  );
});
