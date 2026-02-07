import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

const DATA_CACHE = 'ddr-offline-data-v1';
const SM_CACHE = 'ddr-offline-sm-v1';
const META_CACHE = 'ddr-offline-meta-v1';
const OFFLINE_FLAG_URL = '/__offline-enabled';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();

let offlineEnabled = false;
let prefetchInProgress = false;

async function loadOfflineFlag() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(OFFLINE_FLAG_URL);
    if (!res) return false;
    const text = await res.text();
    return text.trim() === '1';
  } catch {
    return false;
  }
}

async function persistOfflineFlag(enabled) {
  try {
    const cache = await caches.open(META_CACHE);
    if (!enabled) {
      await cache.delete(OFFLINE_FLAG_URL);
      return;
    }
    await cache.put(OFFLINE_FLAG_URL, new Response('1', { headers: { 'Content-Type': 'text/plain' } }));
  } catch {
    // ignore persistence errors
  }
}

const offlineFlagReady = loadOfflineFlag().then((val) => {
  offlineEnabled = val;
  return val;
});

async function postToClients(msg) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(msg);
  }
}

const DATA_PATHS = new Set([
  '/song-meta.json',
  '/sm-files.json',
  '/combined_song_ratings.json',
  '/courses-data.json',
  '/dan-data.json',
  '/vega-data.json',
  '/vega-results.json',
  '/song-lengths.json',
]);

function isDataRequest(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/sm/')) return false;
  if (DATA_PATHS.has(url.pathname)) return true;
  if (url.pathname.startsWith('/ddr-ver/') && url.pathname.endsWith('.json')) return true;
  return false;
}

function isSmRequest(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith('/sm/')) return false;
  return url.pathname.endsWith('.sm');
}

const offlineOnlyPlugin = {
  cacheWillUpdate: async ({ response }) => (offlineEnabled ? response : null),
};

registerRoute(
  ({ url, request }) => isDataRequest(url, request),
  new StaleWhileRevalidate({
    cacheName: DATA_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      offlineOnlyPlugin,
    ],
  }),
);

registerRoute(
  ({ url, request }) => isSmRequest(url, request),
  new CacheFirst({
    cacheName: SM_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20000, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      offlineOnlyPlugin,
    ],
  }),
);

const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(new NavigationRoute(navigationHandler));

self.addEventListener('message', (event) => {
  const data = event?.data || {};
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data?.type === 'OFFLINE_STATUS_REQUEST') {
    offlineFlagReady.then(() => {
      postToClients({
        type: 'OFFLINE_STATUS',
        enabled: offlineEnabled,
        downloading: prefetchInProgress,
      });
    });
    return;
  }
  if (data?.type === 'OFFLINE_CLEAR') {
    event.waitUntil(clearOfflineCaches());
    return;
  }
  if (data?.type === 'OFFLINE_PREFETCH') {
    const urls = Array.isArray(data.urls) ? data.urls : [];
    event.waitUntil(prefetchOffline(urls));
  }
});

async function clearOfflineCaches() {
  await offlineFlagReady;
  prefetchInProgress = false;
  offlineEnabled = false;
  await persistOfflineFlag(false);
  await caches.delete(DATA_CACHE);
  await caches.delete(SM_CACHE);
  await postToClients({ type: 'OFFLINE_CLEARED' });
}

async function prefetchOffline(urls) {
  await offlineFlagReady;
  if (!Array.isArray(urls) || urls.length === 0) {
    await postToClients({ type: 'OFFLINE_ERROR', message: 'No URLs provided.' });
    return;
  }
  if (prefetchInProgress) return;
  prefetchInProgress = true;
  try {
    await postToClients({ type: 'OFFLINE_PROGRESS', done: 0, total: urls.length });

    const dataCache = await caches.open(DATA_CACHE);
    const smCache = await caches.open(SM_CACHE);
    let done = 0;
    let failed = 0;

    for (const rawUrl of urls) {
      const url = typeof rawUrl === 'string' ? rawUrl : '';
      if (!url) {
        done += 1;
        failed += 1;
        continue;
      }
      try {
        const request = new Request(url, { cache: 'reload' });
        const targetCache = url.endsWith('.sm') ? smCache : dataCache;
        const hit = await targetCache.match(request);
        if (!hit) {
          const res = await fetch(request);
          if (res.ok) {
            await targetCache.put(request, res.clone());
          } else {
            failed += 1;
          }
        }
      } catch {
        failed += 1;
      }
      done += 1;
      if (done % 25 === 0 || done === urls.length) {
        await postToClients({ type: 'OFFLINE_PROGRESS', done, total: urls.length, failed });
      }
    }

    offlineEnabled = true;
    await persistOfflineFlag(true);
    await postToClients({ type: 'OFFLINE_DONE', done, total: urls.length, failed });
  } finally {
    prefetchInProgress = false;
  }
}
