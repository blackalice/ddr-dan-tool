const SESSION_NAMESPACE_KEY = 'remoteStorage:namespace';

let cache = {};
let lastSynced = {}; // snapshot of last known server state
let initialized = false;
let listenersAttached = false;
let syncEnabled = false;
let namespace = 'anon'; // localStorage namespace: 'anon' or 'user:<email>'

function persistActiveNamespace(ns) {
  try {
    if (typeof window === 'undefined') return;
    if (ns && ns !== 'anon') {
      window.sessionStorage.setItem(SESSION_NAMESPACE_KEY, ns);
    } else {
      window.sessionStorage.removeItem(SESSION_NAMESPACE_KEY);
    }
  } catch (_e) { void _e; }
}

function applyNamespace(nextNamespace) {
  namespace = nextNamespace || 'anon';
  persistActiveNamespace(namespace);
}

function restoreNamespaceFromSession() {
  try {
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem(SESSION_NAMESPACE_KEY);
    if (!stored) return;
    namespace = stored;
  } catch (_e) { void _e; }
}

restoreNamespaceFromSession();

function nsKey(key) {
  return `${namespace}:${key}`;
}

function resetState() {
  cache = {};
  lastSynced = {};
  lastSent = null;
}

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
    const res = await fetch('/api/user/data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: payload,
    });
    if (!res.ok) {
      console.warn('[storage] flush failed', res.status);
      if (res.status !== 413) {
        scheduleFlush();
      }
      return;
    }
    lastSent = payload;
    lastSynced = { ...cache };
    lastFlushTime = Date.now();
  } catch (err) {
    console.warn('[storage] flush error', err);
    if (syncEnabled) scheduleFlush();
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
  const canUseBeacon = useBeacon
    && typeof navigator !== 'undefined'
    && typeof navigator.sendBeacon === 'function'
    && payload.length <= 60000; // ~60 KiB safety cap
  if (canUseBeacon) {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const queued = navigator.sendBeacon('/api/user/data', blob);
      if (queued) {
        lastSent = payload;
        lastSynced = { ...cache };
        lastFlushTime = Date.now();
        return;
      }
    } catch (err) {
      console.warn('[storage] sendBeacon failed', err);
    }
  }
  // Fire and forget
  fetch('/api/user/data', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: payload,
  })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      lastSent = payload;
      lastSynced = { ...cache };
      lastFlushTime = Date.now();
    })
    .catch(err => {
      console.warn('[storage] flushNow fetch failed', err);
    });
}

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const res = await fetch('/api/user/data', { credentials: 'include' });
    if (res.ok) {
      // Authenticated: enable sync and switch to user namespace
      const raw = await res.json();
      const email = typeof raw.email === 'string' ? raw.email : null;
      applyNamespace(email ? `user:${email}` : 'user:unknown');
      syncEnabled = true;
      // Reset local cache for this session and hydrate from server data (excluding email)
      resetState();
      const { email: _skipEmail, ...serverData } = raw || {}; void _skipEmail;
      Object.assign(cache, serverData);
      lastSynced = { ...cache };
      lastSent = JSON.stringify(lastSynced);
      // Do NOT auto-migrate anonymous localStorage into user account to avoid leakage
    } else if (res.status === 401) {
      // Unauthenticated: disable sync and use anonymous namespace
      syncEnabled = false;
      applyNamespace('anon');
      resetState();
      // Hydrate from namespaced localStorage only (avoid cross-account pollution)
      try {
        if (typeof window !== 'undefined') {
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (!key || !key.startsWith(`${namespace}:`)) continue;
            const unprefixed = key.slice(namespace.length + 1);
            const value = window.localStorage.getItem(key);
            if (value !== null) cache[unprefixed] = value;
          }
          lastSynced = { ...cache }; // local snapshot only
          lastSent = null;
        }
      } catch (_e) { void _e; }
    }
  } catch (_e) {
    void _e;
    // ignore errors
  }
  // Ensure we attempt to persist on tab close
  if (!listenersAttached && typeof window !== 'undefined') {
    const onHide = () => flushNow(true);
    window.addEventListener('visibilitychange', onHide, { once: false });
    window.addEventListener('beforeunload', onHide, { once: false });
    listenersAttached = true;
  }
}

function getItem(key) {
  if (cache[key] != null) return cache[key];
  try {
    if (typeof window !== 'undefined') {
      // Read namespaced key first
      const v = window.localStorage.getItem(nsKey(key));
      if (v != null) return v;
      // Legacy fallback only for anonymous sessions to avoid account leakage
      if (namespace === 'anon') {
        const legacy = window.localStorage.getItem(key);
        if (legacy != null) return legacy;
      }
    }
  } catch (_e) { void _e; }
  return null;
}

function setItem(key, value) {
  cache[key] = value;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(nsKey(key), String(value));
    }
  } catch (_e) { void _e; }
  scheduleFlush();
}

function clear() {
  // Clear in-memory
  for (const key of Object.keys(cache)) delete cache[key];
  // Clear only current namespace in localStorage
  const activeNamespace = namespace;
  try {
    if (typeof window !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(`${activeNamespace}:`)) toRemove.push(k);
      }
      for (const k of toRemove) window.localStorage.removeItem(k);
    }
  } catch (_e) { void _e; }
  // Clear server copy for authenticated users
  lastSynced = {};
  lastSent = JSON.stringify(lastSynced);
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  if (syncEnabled) {
    fetch('/api/user/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => {})
  }
  syncEnabled = false;
  initialized = false;
  applyNamespace('anon');
}
async function refresh() {
  // Avoid refetch churn; prefer hydrateFrom when data already available
  if (!initialized) await init();
}

// Hydrate storage directly from a server payload (avoids extra GET)
function hydrateFrom(raw) {
  if (!raw || typeof raw !== 'object') return;
  // Switch to user namespace and enable sync
  const email = typeof raw.email === 'string' ? raw.email : null;
  applyNamespace(email ? `user:${email}` : 'user:unknown');
  syncEnabled = true;
  resetState();
  // Exclude email from key space
  const { email: _skip, ...serverData } = raw || {}; void _skip;
  Object.assign(cache, serverData);
  lastSynced = { ...cache };
  lastSent = JSON.stringify(lastSynced);
  initialized = true;
  if (!listenersAttached && typeof window !== 'undefined') {
    const onHide = () => flushNow(true);
    window.addEventListener('visibilitychange', onHide, { once: false });
    window.addEventListener('beforeunload', onHide, { once: false });
    listenersAttached = true;
  }
}

export const storage = { init, refresh, hydrateFrom, getItem, setItem, clear };
