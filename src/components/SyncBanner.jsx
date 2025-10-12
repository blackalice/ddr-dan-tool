import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { onSyncStatusChange, getSyncStatus, storage } from '../utils/remoteStorage.js';
import { useNavigate } from 'react-router-dom';

export default function SyncBanner() {
  const [active, setActive] = useState(() => !getSyncStatus());
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && window.sessionStorage.getItem('syncBannerDismissed') === '1'; } catch { return false; }
  });
  const navigate = useNavigate();

  useEffect(() => {
    const off = onSyncStatusChange((enabled) => {
      setActive(!enabled);
      if (enabled) {
        // Clear dismissal when sync resumes; next time it pauses we show again
        try { if (typeof window !== 'undefined') window.sessionStorage.removeItem('syncBannerDismissed'); } catch { /* noop */ }
        setDismissed(false);
      }
    });
    // In case no event yet
    setActive(!getSyncStatus());
    return () => { try { off(); } catch { /* noop */ } };
  }, []);

  if (!active || dismissed) return null;

  const tryRefresh = async () => {
    try {
      const res = await fetch('/api/refresh', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await storage.refresh();
        return;
      }
    } catch { /* noop */ }
    navigate('/login');
  };

  const BANNER_HEIGHT = 44;
  const style = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2001,
    background: 'var(--danger-bg, #4b1f1f)', color: 'var(--danger-fg, #fff)',
    minHeight: `${BANNER_HEIGHT}px`, padding: '8px 12px', paddingTop: 'env(safe-area-inset-top, 0px)', display: 'flex', alignItems: 'center', gap: '12px',
    justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  };
  const btn = {
    background: 'var(--accent-color, #2d89ef)', color: '#fff', border: 'none',
    padding: '6px 10px', borderRadius: 4, cursor: 'pointer'
  };
  const closeBtn = {
    position: 'absolute', right: 8, top: 'calc(8px + env(safe-area-inset-top, 0px))',
    background: 'transparent', color: 'inherit', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4,
  };

  const dismiss = () => {
    try { if (typeof window !== 'undefined') window.sessionStorage.setItem('syncBannerDismissed', '1'); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <>
      {/* Spacer to push sticky tabs below the banner */}
      <div style={{ height: `calc(${BANNER_HEIGHT}px + env(safe-area-inset-top, 0px))` }} />
      {createPortal(
        <div style={style} role="status" aria-live="polite">
          <span>Sync paused. Please re‑login to resume saving across devices.</span>
          <button onClick={tryRefresh} style={btn}>Re‑authenticate</button>
          <button onClick={() => navigate('/login')} style={{...btn, background: '#666'}}>Go to Login</button>
          <button onClick={dismiss} aria-label="Dismiss" title="Dismiss" style={closeBtn}>×</button>
        </div>,
        typeof document !== 'undefined' ? document.body : (typeof window !== 'undefined' ? window.document.body : undefined)
      )}
    </>
  );
}
