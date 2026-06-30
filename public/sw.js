const CACHE_VERSION = 'rootfacts-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const MODEL_CACHE = `${CACHE_VERSION}-model`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Aset dengan path yang pasti diketahui — aman untuk di-precache langsung saat install.
// Termasuk berkas model TensorFlow.js agar deteksi sayuran tetap berfungsi offline.
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/model/model.json',
  '/model/metadata.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC_CACHE);
      const modelCache = await caches.open(MODEL_CACHE);

      // Precache aset umum (HTML shell, manifest, ikon)
      await Promise.allSettled(
        PRECACHE_URLS.filter((url) => !url.startsWith('/model/')).map((url) =>
          staticCache.add(url).catch((err) => {
            console.warn('[SW] Gagal precache:', url, err);
          })
        )
      );

      // Precache khusus model AI (model.json + metadata.json).
      // weights.bin (shard) tidak diketahui nama/jumlah filenya secara pasti di sini,
      // jadi akan ditangkap oleh runtime caching saat pertama kali di-fetch oleh browser.
      await Promise.allSettled(
        PRECACHE_URLS.filter((url) => url.startsWith('/model/')).map((url) =>
          modelCache.add(url).catch((err) => {
            console.warn('[SW] Gagal precache model:', url, err);
          })
        )
      );

      console.log('[SW] Install selesai, aset inti & model di-precache.');
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('rootfacts-') && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name))
      );
      console.log('[SW] Activate selesai, cache lama dibersihkan.');
    })()
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Hanya tangani GET request
  if (request.method !== 'GET') return;

  // 1) Navigasi HTML (buka/refresh halaman): network-first, fallback ke cache shell "/"
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put('/', response.clone());
          return response;
        } catch (err) {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match('/');
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // 2) Berkas model TensorFlow.js lokal (/model/...): cache-first, simpan shard
  //    weights.bin yang belum tertangkap saat install.
  if (url.pathname.startsWith('/model/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODEL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  if (url.hostname.includes('huggingface.co') || url.hostname.includes('hf.co')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODEL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })()
    );
    return;
  }

  // 4) Aset statis lain (JS/CSS hasil build, ikon, dll): stale-while-revalidate —
  //    langsung balas dari cache kalau ada (cepat), sambil update cache di background.
  if (
    url.origin === self.location.origin &&
    /\.(js|css|png|svg|ico|woff2?|json)$/.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);

        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => null);

        return cached || (await networkFetch) || new Response('', { status: 504 });
      })()
    );
    return;
  }

});