import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyServiceWorkerUpdate,
  onServiceWorkerEvent,
  getServiceWorkerStatus,
  checkForServiceWorkerUpdate,
  forceServiceWorkerUpdate,
} from '../utils/swRegistration.js';

const DISMISS_KEY = 'swUpdateDismissed';

export default function UpdateBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && window.sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });
  const [shouldShow, setShouldShow] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const current = getServiceWorkerStatus();
    if (current.needRefresh) {
      setShouldShow(true);
      setDismissed(false);
    }
    const off = onServiceWorkerEvent((event) => {
      if (event?.type === 'need-refresh') {
        setShouldShow(true);
        try { if (typeof window !== 'undefined') window.sessionStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
        setDismissed(false);
      }
      if (event?.type === 'offline-ready') {
        setShouldShow(false);
      }
    });
    checkForServiceWorkerUpdate();
    return () => off();
  }, []);

  if (!shouldShow || dismissed) return null;

  const BANNER_HEIGHT = 44;
  const style = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2002,
    background: 'var(--accent-color, #2d89ef)', color: 'var(--text-color, #fff)',
    minHeight: `${BANNER_HEIGHT}px`, padding: '8px 12px', paddingTop: 'env(safe-area-inset-top, 0px)',
    display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  };
  const btn = {
    background: 'rgba(0,0,0,0.2)', color: 'inherit', border: 'none',
    padding: '6px 10px', borderRadius: 4, cursor: 'pointer'
  };
  const closeBtn = {
    position: 'absolute', right: 8, top: 'calc(8px + env(safe-area-inset-top, 0px))',
    background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4,
  };

  const dismiss = () => {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  const refresh = () => {
    setUpdating(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        const handler = () => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('sw', String(Date.now()));
            window.location.replace(url.toString());
          } catch {
            window.location.reload();
          }
        };
        navigator.serviceWorker.addEventListener('controllerchange', handler, { once: true });
        // Fallback: if controllerchange doesn't fire, do a hard reload.
        setTimeout(() => {
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('sw', String(Date.now()));
            window.location.replace(url.toString());
          } catch { /* noop */ }
        }, 4000);
      }
    } catch { /* noop */ }
    forceServiceWorkerUpdate();
    applyServiceWorkerUpdate();
  };

  return (
    <>
      <div style={{ height: `calc(${BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))` }} />
      {createPortal(
        <div style={style} role="status" aria-live="polite">
          <span>Update available. Refresh to load the latest version.</span>
          <button onClick={refresh} style={btn} disabled={updating}>
            {updating ? 'Updating…' : 'Refresh'}
          </button>
          <button onClick={dismiss} aria-label="Dismiss" title="Dismiss" style={closeBtn}>×</button>
        </div>,
        typeof document !== 'undefined' ? document.body : (typeof window !== 'undefined' ? window.document.body : undefined)
      )}
    </>
  );
}
