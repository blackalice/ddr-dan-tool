import { registerSW } from 'virtual:pwa-register';

let updateSW = null;
let registrationRef = null;
const listeners = new Set();
const status = {
  needRefresh: false,
  offlineReady: false,
};

function emit(event) {
  for (const listener of Array.from(listeners)) {
    try { listener(event); } catch { /* noop */ }
  }
}

function setNeedRefresh() {
  status.needRefresh = true;
  emit({ type: 'need-refresh' });
}

function setOfflineReady() {
  status.offlineReady = true;
  emit({ type: 'offline-ready' });
}

function watchRegistration(reg) {
  if (!reg) return;
  if (reg.waiting) {
    setNeedRefresh();
  }
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        setNeedRefresh();
      }
    });
  });
}

export function registerServiceWorker() {
  if (updateSW) return;
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      setNeedRefresh();
    },
    onOfflineReady() {
      setOfflineReady();
    },
    onRegisteredSW(_swUrl, reg) {
      registrationRef = reg;
      watchRegistration(reg);
    },
  });
}

export function applyServiceWorkerUpdate() {
  if (typeof updateSW === 'function') {
    updateSW(true);
  }
}

export async function forceServiceWorkerUpdate() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  let reg = registrationRef;
  if (!reg) {
    try { reg = await navigator.serviceWorker.getRegistration(); } catch { /* noop */ }
    if (reg) {
      registrationRef = reg;
      watchRegistration(reg);
    }
  }
  if (!reg) return false;
  try { await reg.update(); } catch { /* noop */ }

  const waiting = reg.waiting;
  if (waiting) {
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); } catch { /* noop */ }
    return true;
  }

  const installing = reg.installing;
  if (installing) {
    installing.addEventListener('statechange', () => {
      if (reg.waiting) {
        try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch { /* noop */ }
      }
    }, { once: true });
  }
  return Boolean(reg.waiting || reg.installing);
}

export function onServiceWorkerEvent(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getServiceWorkerStatus() {
  return { ...status };
}

export async function checkForServiceWorkerUpdate() {
  if (registrationRef) {
    watchRegistration(registrationRef);
    try { await registrationRef.update(); } catch { /* noop */ }
    return;
  }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      registrationRef = reg;
      watchRegistration(reg);
      try { await reg.update(); } catch { /* noop */ }
    }
  } catch { /* noop */ }
}
