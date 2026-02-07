import { useCallback, useEffect, useMemo, useState } from 'react';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides.js';

const BASE_DATA_URLS = [
  '/song-meta.json',
  '/sm-files.json',
  '/combined_song_ratings.json',
  '/courses-data.json',
  '/dan-data.json',
  '/vega-data.json',
  '/vega-results.json',
  '/song-lengths.json',
];

function supportsServiceWorker() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

async function postToServiceWorker(message) {
  if (!supportsServiceWorker()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sw = reg?.active || reg?.waiting || reg?.installing;
  if (sw) {
    sw.postMessage(message);
    return true;
  }
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(message);
    return true;
  }
  return false;
}

async function buildOfflineUrlList() {
  const overrideUrls = SONGLIST_OVERRIDE_OPTIONS
    .map((opt) => opt.file)
    .filter(Boolean);

  const res = await fetch('/sm-files.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load sm-files.json');
  const data = await res.json();
  const smPaths = Array.isArray(data?.files)
    ? data.files
        .map((file) => encodeURI(`/${file.path}`))
        .filter((path) => path.endsWith('.sm'))
    : [];

  const combined = [...BASE_DATA_URLS, ...overrideUrls, ...smPaths];
  return Array.from(new Set(combined));
}

const initialState = {
  supported: supportsServiceWorker(),
  enabled: false,
  downloading: false,
  done: 0,
  total: 0,
  failed: 0,
  error: null,
};

export function useOfflineCache() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    if (!supportsServiceWorker()) return undefined;
    const handler = (event) => {
      const data = event?.data || {};
      if (data.type === 'OFFLINE_STATUS') {
        setState((prev) => ({
          ...prev,
          enabled: Boolean(data.enabled),
          downloading: Boolean(data.downloading),
          error: null,
        }));
        return;
      }
      if (data.type === 'OFFLINE_PROGRESS') {
        setState((prev) => ({
          ...prev,
          downloading: true,
          done: Number(data.done) || 0,
          total: Number(data.total) || prev.total || 0,
          failed: Number(data.failed) || 0,
          error: null,
        }));
        return;
      }
      if (data.type === 'OFFLINE_DONE') {
        setState((prev) => ({
          ...prev,
          enabled: true,
          downloading: false,
          done: Number(data.done) || prev.total || 0,
          total: Number(data.total) || prev.total || 0,
          failed: Number(data.failed) || 0,
          error: null,
        }));
        return;
      }
      if (data.type === 'OFFLINE_CLEARED') {
        setState((prev) => ({
          ...prev,
          enabled: false,
          downloading: false,
          done: 0,
          total: 0,
          failed: 0,
          error: null,
        }));
        return;
      }
      if (data.type === 'OFFLINE_ERROR') {
        setState((prev) => ({
          ...prev,
          downloading: false,
          error: data.message || 'Offline download failed.',
        }));
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    postToServiceWorker({ type: 'OFFLINE_STATUS_REQUEST' });
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  const startDownload = useCallback(async () => {
    if (!supportsServiceWorker()) return;
    setState((prev) => ({
      ...prev,
      downloading: true,
      done: 0,
      total: 0,
      failed: 0,
      error: null,
    }));
    try {
      const urls = await buildOfflineUrlList();
      setState((prev) => ({
        ...prev,
        total: urls.length,
      }));
      const sent = await postToServiceWorker({ type: 'OFFLINE_PREFETCH', urls });
      if (!sent) {
        setState((prev) => ({
          ...prev,
          downloading: false,
          error: 'Service worker not ready. Reload the page and try again.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: err?.message || 'Failed to prepare offline download.',
      }));
    }
  }, []);

  const clearDownload = useCallback(async () => {
    if (!supportsServiceWorker()) return;
    setState((prev) => ({
      ...prev,
      downloading: false,
      error: null,
    }));
    await postToServiceWorker({ type: 'OFFLINE_CLEAR' });
  }, []);

  const statusLabel = useMemo(() => {
    if (!state.supported) return 'Offline cache is not supported in this browser.';
    if (state.downloading) {
      const total = state.total || 0;
      const done = state.done || 0;
      return `Downloading offline data (${done}/${total})${state.failed ? `, ${state.failed} failed` : ''}.`;
    }
    if (state.enabled) {
      if (state.failed) return `Offline data is ready, but ${state.failed} files failed to cache.`;
      return 'Offline data is ready on this device.';
    }
    return 'Offline data has not been downloaded yet.';
  }, [state]);

  return {
    ...state,
    statusLabel,
    startDownload,
    clearDownload,
  };
}
