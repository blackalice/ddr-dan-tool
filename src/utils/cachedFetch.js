// Lightweight cached fetch helpers for static JSON/text and in-flight deduplication.
// - Caches successful GET responses in-memory with TTL
// - De-duplicates concurrent requests for the same URL

const memoryCache = new Map(); // url -> { ts: number, data: any }
const inFlight = new Map(); // url -> Promise<any>

function now() { return Date.now(); }

function _cacheKey(url) {
  // Normalise leading slashes to avoid double-keying
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return u.pathname + (u.search || '');
  } catch {
    return url;
  }
}

async function fetchJsonCached(url, { ttlMs = 24 * 60 * 60 * 1000, init } = {}) {
  const key = _cacheKey(url);
  const hit = memoryCache.get(key);
  if (hit && (now() - hit.ts) < ttlMs) return hit.data;

  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      const data = await res.json();
      memoryCache.set(key, { ts: now(), data });
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

async function fetchTextCached(url, { ttlMs = 24 * 60 * 60 * 1000, init } = {}) {
  const key = _cacheKey(url);
  const hit = memoryCache.get(key);
  if (hit && (now() - hit.ts) < ttlMs) return hit.data;

  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
      const data = await res.text();
      memoryCache.set(key, { ts: now(), data });
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

// Convenience helpers for frequently used resources
export function getSongMeta() {
  return fetchJsonCached('/song-meta.json');
}
export function getRadarValues() {
  return fetchJsonCached('/radar-values.json');
}
export function getJsonCached(url, opts) {
  return fetchJsonCached(url, opts);
}
export function getTextCached(url, opts) {
  return fetchTextCached(url, opts);
}

// Expose a simple way to prime cache if needed
export function primeCache(url, data) {
  memoryCache.set(_cacheKey(url), { ts: now(), data });
}

