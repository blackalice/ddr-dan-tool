const cache = {};
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  try {
    const res = await fetch('/user/data', { credentials: 'include' });
    if (res.ok) {
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
          await fetch('/user/data', {
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
  fetch('/user/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(cache),
  });
}

export const storage = { init, getItem, setItem };
