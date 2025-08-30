const cache = {};
let lastSynced = {}; // snapshot of last known server state
let initialized = false;
let syncEnabled = false;

// Debounced batching for writes
let flushTimer = null;
let maxTimer = null;
let lastSent = null; // cache JSON string of last successful/attempted send
const FLUSH_DELAY = 300; // ms
const MAX_FLUSH_INTERVAL = 10000; // ms
let lastFlushTime = 0;

function scheduleFlush() {
  if (!syncEnabled) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DELAY);
  if (!maxTimer) {
    const dueIn = Math.max(0, MAX_FLUSH_INTERVAL - (Date.now() - lastFlushTime));
    maxTimer = setTimeout(() => { flush(); }, dueIn);
  }
}

function computeDelta() {
  const delta = {};
  // Changed and added keys
  for (const k of Object.keys(cache)) {
    if (cache[k] !== lastSynced[k]) delta[k] = cache[k];
  }
  // Removed keys -> null sentinel
  for (const k of Object.keys(lastSynced)) {
    if (!(k in cache)) delta[k] = null;
  }
  return delta;
}

async function flush() {
  if (!syncEnabled) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  try {
    const delta = computeDelta();
    if (Object.keys(delta).length === 0) return;
    const payload = JSON.stringify(delta);
    if (payload === lastSent) return; // already sent
    await fetch('/api/user/data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: payload,
    });
    lastSent = payload;
    lastSynced = { ...cache };
    lastFlushTime = Date.now();
  } catch {
    // ignore network errors; next write will retry
  }
}

function flushNow(useBeacon = false) {
  if (!syncEnabled) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  const delta = computeDelta();
  if (Object.keys(delta).length === 0) return;
  const payload = JSON.stringify(delta);
  if (payload === lastSent) return;
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/user/data', blob); // server merges POST body
      lastSent = payload;
      lastSynced = { ...cache };
      lastFlushTime = Date.now();
      return;
    } catch {}
  }
  // Fire and forget
  fetch('/api/user/data', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: payload,
  })
    .then(() => { lastSent = payload; lastSynced = { ...cache }; lastFlushTime = Date.now(); })
    .catch(() => {});
}

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const res = await fetch('/api/user/data', { credentials: 'include' });
    if (res.ok) {
      syncEnabled = true;
      const data = await res.json();
      if (Object.keys(data).length === 0) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          const value = window.localStorage.getItem(key);
          if (value !== null) {
            cache[key] = value;
          }
        }
        if (Object.keys(cache).length > 0) {
          // Migrate local storage to server once
          await fetch('/api/user/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(cache),
          });
          window.localStorage.clear();
        }
      } else {
        Object.assign(cache, data);
        lastSynced = { ...cache };
        lastSent = JSON.stringify(lastSynced);
      }
    } else if (res.status === 401) {
      syncEnabled = false;
    }
  } catch {
    // ignore errors
  }
  // Ensure we attempt to persist on tab close
  if (typeof window !== 'undefined') {
    const onHide = () => flushNow(true);
    window.addEventListener('visibilitychange', onHide, { once: false });
    window.addEventListener('beforeunload', onHide, { once: false });
  }
}

function getItem(key) {
  return cache[key] ?? null;
}

function setItem(key, value) {
  cache[key] = value;
  scheduleFlush();
}

function clear() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
  // Clear on server using a full PUT of {} to avoid ambiguity
  lastSynced = {};
  lastSent = JSON.stringify(lastSynced);
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  fetch('/api/user/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  }).catch(() => {})
}
async function refresh() {
  initialized = false;
  await init();
}

export const storage = { init, refresh, getItem, setItem, clear };
