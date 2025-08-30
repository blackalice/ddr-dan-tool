const cache = {};
let initialized = false;
let syncEnabled = false;

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
      }
    } else if (res.status === 401) {
      syncEnabled = false;
    }
  } catch {
    // ignore errors
  }
}

function getItem(key) {
  return cache[key] ?? null;
}

function setItem(key, value) {
  cache[key] = value;
  if (!syncEnabled) return;
  fetch('/api/user/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(cache),
  });
}

function clear() {
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
  if (!syncEnabled) return;
  fetch('/api/user/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({}),
  });
}
async function refresh() {
  initialized = false;
  await init();
}

export const storage = { init, refresh, getItem, setItem, clear };
