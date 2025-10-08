let cache = {};
let lastSyncedEntries = {}; // snapshot of last known server sync keys (chunk aware)
let initialized = false;
let listenersAttached = false;
let syncEnabled = false;
let currentEmail = null;
let namespace = 'anon'; // localStorage namespace: 'anon' or 'user:<email>'

const localOnlyKeys = new Set(); // keys kept local because payload is too large for sync
const warnedLocalOnly = new Set();

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const MAX_SYNC_BYTES = 240 * 1024; // keep margin under server limit (256 KiB)
const CHUNKED_KEYS = new Set(['ddrScores']);
const CHUNK_META_SUFFIX = '__meta';
const CHUNK_DELIMITER = '__chunk_';
const CHUNK_SIZE_CHARS = 48 * 1024; // target chunk size (~48 KiB) to stay well under payload limit per entry

function baseKeyForSyncKey(key) {
  if (!key) return key;
  if (key.endsWith(CHUNK_META_SUFFIX)) {
    return key.slice(0, -CHUNK_META_SUFFIX.length);
  }
  const idx = key.indexOf(CHUNK_DELIMITER);
  if (idx !== -1) {
    return key.slice(0, idx);
  }
  return key;
}

function chunkValue(key, value) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const chunks = [];
  for (let i = 0; i < str.length; i += CHUNK_SIZE_CHARS) {
    chunks.push(str.slice(i, i + CHUNK_SIZE_CHARS));
  }
  const entries = {};
  entries[`${key}${CHUNK_META_SUFFIX}`] = JSON.stringify({ version: 1, chunks: chunks.length });
  chunks.forEach((chunk, idx) => {
    entries[`${key}${CHUNK_DELIMITER}${idx}`] = chunk;
  });
  return entries;
}

function buildSyncEntries(source = cache) {
  const entries = {};
  for (const [key, value] of Object.entries(source)) {
    if (value == null) continue;
    if (localOnlyKeys.has(key)) continue;
    if (CHUNKED_KEYS.has(key)) {
      Object.assign(entries, chunkValue(key, value));
    } else {
      entries[key] = value;
    }
  }
  return entries;
}

export function expandStoragePayload(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  const chunkBuckets = new Map();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key !== 'string') continue;
    if (key.endsWith(CHUNK_META_SUFFIX)) {
      const base = baseKeyForSyncKey(key);
      const bucket = chunkBuckets.get(base) || { meta: null, chunks: new Map() };
      bucket.meta = value;
      chunkBuckets.set(base, bucket);
      continue;
    }
    const chunkIdx = key.indexOf(CHUNK_DELIMITER);
    if (chunkIdx !== -1) {
      const base = baseKeyForSyncKey(key);
      const bucket = chunkBuckets.get(base) || { meta: null, chunks: new Map() };
      const idx = Number.parseInt(key.slice(chunkIdx + CHUNK_DELIMITER.length), 10);
      if (Number.isFinite(idx)) {
        bucket.chunks.set(idx, typeof value === 'string' ? value : String(value ?? ''));
        chunkBuckets.set(base, bucket);
      }
      continue;
    }
    result[key] = value;
  }
  for (const [base, bucket] of chunkBuckets.entries()) {
    if (result[base] != null) continue;
    let expected = null;
    if (bucket.meta != null) {
      try {
        const parsed = typeof bucket.meta === 'string' ? JSON.parse(bucket.meta) : bucket.meta;
        if (parsed && typeof parsed === 'object' && Number.isFinite(parsed.chunks)) {
          expected = parsed.chunks;
        }
      } catch { /* ignore parse errors */ }
    }
    const total = expected != null ? expected : bucket.chunks.size;
    if (!total) continue;
    let combined = '';
    let valid = true;
    for (let i = 0; i < total; i++) {
      if (!bucket.chunks.has(i)) {
        valid = false;
        break;
      }
      combined += bucket.chunks.get(i);
    }
    if (valid) {
      result[base] = combined;
    }
  }
  return result;
}
function estimateBytes(value) {
  if (!value) return 0;
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  if (!json) return 0;
  if (!encoder) return json.length;
  try {
    return encoder.encode(json).length;
  } catch (_e) {
    void _e;
    return json.length;
  }
}

function markLocalOnly(keys) {
  for (const key of keys) {
    if (!key) continue;
    const base = baseKeyForSyncKey(key);
    localOnlyKeys.add(base);
    if (!warnedLocalOnly.has(base)) {
      warnedLocalOnly.add(base);
      try {
        console.warn(`[storage] Keeping "${base}" local only (payload too large for sync).`);
      } catch (_e) {
        void _e;
      }
    }
    // Remove any synced entries for this base key so future deltas ignore it
    for (const syncedKey of Object.keys(lastSyncedEntries)) {
      if (baseKeyForSyncKey(syncedKey) === base) {
        delete lastSyncedEntries[syncedKey];
      }
    }
  }
}

function nsKey(key) {
  return `${namespace}:${key}`;
}

function resetState() {
  cache = {};
  lastSyncedEntries = {};
  localOnlyKeys.clear();
  warnedLocalOnly.clear();
}

// Debounced batching for writes
let flushTimer = null;
let maxTimer = null;
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
  const snapshot = buildSyncEntries();
  const delta = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (lastSyncedEntries[key] !== value) {
      delta[key] = value;
    }
  }
  for (const key of Object.keys(lastSyncedEntries)) {
    if (!(key in snapshot)) {
      delta[key] = null;
    }
  }
  return { delta, snapshot };
}

function preparePayloads(delta) {
  const entries = Object.entries(delta);
  if (entries.length === 0) {
    return { batches: [], oversized: [] };
  }
  const batches = [];
  const oversized = [];
  let batch = {};
  for (const [key, value] of entries) {
    const candidate = { ...batch, [key]: value };
    if (estimateBytes(JSON.stringify(candidate)) <= MAX_SYNC_BYTES) {
      batch = candidate;
      continue;
    }
    if (Object.keys(batch).length > 0) {
      batches.push({ payload: JSON.stringify(batch), keys: Object.keys(batch) });
      batch = {};
      if (estimateBytes(JSON.stringify({ [key]: value })) <= MAX_SYNC_BYTES) {
        batch = { [key]: value };
      } else {
        oversized.push(key);
      }
      continue;
    }
    oversized.push(key);
  }
  if (Object.keys(batch).length > 0) {
    batches.push({ payload: JSON.stringify(batch), keys: Object.keys(batch) });
  }
  return { batches, oversized };
}

function updateSyncedKeys(keys, snapshot) {
  for (const key of keys) {
    if (snapshot[key] === undefined) {
      delete lastSyncedEntries[key];
    } else {
      lastSyncedEntries[key] = snapshot[key];
    }
  }
}

async function flush() {
  if (!syncEnabled) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  try {
    const { delta, snapshot } = computeDelta();
    if (Object.keys(delta).length === 0) return;
    const { batches, oversized } = preparePayloads(delta);
    if (oversized.length > 0) markLocalOnly(oversized);
    if (batches.length === 0) return;
    for (const { payload, keys } of batches) {
      const res = await fetch('/api/user/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: payload,
      });
      if (!res.ok) {
        if (res.status === 413) {
          markLocalOnly(keys);
        }
        break;
      }
      updateSyncedKeys(keys, snapshot);
      lastFlushTime = Date.now();
    }
  } catch (_e) { void _e; }
}

function flushNow(useBeacon = false) {
  if (!syncEnabled) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
  const { delta, snapshot } = computeDelta();
  if (Object.keys(delta).length === 0) return;
  const { batches, oversized } = preparePayloads(delta);
  if (oversized.length > 0) markLocalOnly(oversized);
  if (batches.length === 0) return;
  if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      for (const { payload, keys } of batches) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/user/data', blob);
        updateSyncedKeys(keys, snapshot);
      }
      lastFlushTime = Date.now();
      return;
    } catch (_e) { void _e; }
  }
  // Fire and forget for each batch
  const promises = batches.map(({ payload, keys }) => (
    fetch('/api/user/data', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: payload,
    })
      .then((res) => {
        if (!res?.ok) {
          if (res && res.status === 413) {
            markLocalOnly(keys);
          }
          return;
        }
        updateSyncedKeys(keys, snapshot);
        lastFlushTime = Date.now();
      })
      .catch(() => {})
  ));
  Promise.all(promises).catch(() => {});
}

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const res = await fetch('/api/user/data', { credentials: 'include' });
    if (res.ok) {
      // Authenticated: enable sync and switch to user namespace
      const raw = await res.json();
      const expanded = expandStoragePayload(raw);
      // extract email without polluting key space
      currentEmail = typeof expanded.email === 'string'
        ? expanded.email
        : (typeof raw.email === 'string' ? raw.email : null);
      namespace = currentEmail ? `user:${currentEmail}` : 'user:unknown';
      syncEnabled = true;
      // Reset local cache for this session and hydrate from server data (excluding email)
      resetState();
      const { email: _skipEmail, ...serverData } = expanded || {}; void _skipEmail;
      Object.assign(cache, serverData);
      lastSyncedEntries = buildSyncEntries(cache);
      // Do NOT auto-migrate anonymous localStorage into user account to avoid leakage
    } else if (res.status === 401) {
      // Unauthenticated: disable sync and use anonymous namespace
      syncEnabled = false;
      currentEmail = null;
      namespace = 'anon';
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
            lastSyncedEntries = buildSyncEntries(cache); // local snapshot only
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
  try {
    if (typeof window !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(`${namespace}:`)) toRemove.push(k);
      }
      for (const k of toRemove) window.localStorage.removeItem(k);
    }
  } catch (_e) { void _e; }
  // Clear server copy for authenticated users
  lastSyncedEntries = {};
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (syncEnabled) {
    fetch('/api/user/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => {})
  }
}
async function refresh() {
  // Avoid refetch churn; prefer hydrateFrom when data already available
  if (!initialized) await init();
}

// Hydrate storage directly from a server payload (avoids extra GET)
function hydrateFrom(raw) {
  if (!raw || typeof raw !== 'object') return;
  const expanded = expandStoragePayload(raw);
  // Switch to user namespace and enable sync
  currentEmail = typeof expanded.email === 'string'
    ? expanded.email
    : (typeof raw.email === 'string' ? raw.email : null);
  namespace = currentEmail ? `user:${currentEmail}` : 'user:unknown';
  syncEnabled = true;
  resetState();
  // Exclude email from key space
  const { email: _skip, ...serverData } = expanded || {}; void _skip;
  Object.assign(cache, serverData);
  lastSyncedEntries = buildSyncEntries(cache);
  initialized = true;
  if (!listenersAttached && typeof window !== 'undefined') {
    const onHide = () => flushNow(true);
    window.addEventListener('visibilitychange', onHide, { once: false });
    window.addEventListener('beforeunload', onHide, { once: false });
    listenersAttached = true;
  }
}

export const storage = { init, refresh, hydrateFrom, getItem, setItem, clear };
