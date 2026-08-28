/* Montana's Breakfast Truck — service worker.

   Job: make the app open instantly and keep working with no signal.
   Deliberately NOT in charge of the truck's data — that's handled in the page
   itself (localStorage first, then a merge-sync to Apps Script). This only
   caches the files that make up the app.

   Bump the version suffix whenever you upload a new index.html so old copies
   get thrown away rather than lingering on someone's phone. */
const CACHE_PREFIX = 'montanas-';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      // Individual addAll failures (a renamed icon, say) shouldn't block the
      // whole install and leave the app uncached.
      .then((cache) => Promise.all(APP_SHELL.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  /* Only ever delete THIS app's older caches. Cache Storage is scoped per
     ORIGIN, and jaylaantaylor-boop.github.io serves all of our apps, so the
     previous `k !== CACHE_NAME` wiped Mamma Mia's, Main Kitchen's and
     Panatieri's offline copies too — whichever app was opened last won, and
     the others were left with nothing to fall back on with no signal. */
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* Network-first for our own files so a fresh upload reaches phones on the next
   load, with the cache as the fallback when there's no signal. Cross-origin
   requests (the Apps Script sync, Drive photos) pass straight through — they
   must never be served from a stale cache. */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy)).catch(() => {});
          return res;
        }
        // Not an OK response. On the truck's wifi this is usually a captive
        // portal redirecting us — serving that would replace the app with a
        // "sign in to continue" page. Prefer the cached copy when we have one.
        return caches.open(CACHE_NAME).then((c) => c.match(e.request)).then((cached) => cached || res);
      })
      .catch(() => caches.open(CACHE_NAME).then((cache) =>
        cache.match(e.request).then((cached) => cached || cache.match('./index.html'))))
  );
});
