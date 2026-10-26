/* RakshaCall service worker — network first, cache fallback. */
const BASE = new URL('.', self.location.href);
const asset = (path) => new URL(path, BASE).href;
const CACHE = 'rakshacall-shell-v4';
const CORE = [
  BASE.href,
  asset('index.html'),
  asset('manifest.webmanifest'),
  asset('favicon.svg'),
  asset('icons/icon-192.png'),
  asset('icons/icon-512.png'),
  asset('icons/icon-maskable-512.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
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
