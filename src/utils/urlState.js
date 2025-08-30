// URL state helpers for song/chart selection
// Song ID: sm file path from smData.files[].path
// Chart ID: slug from simfileData.availableTypes[].slug

export function parseSelection(location) {
  const out = { songId: null, chartId: null, mode: null, legacy: null };
  const search = new URLSearchParams(location.search || '');
  const s = search.get('s');
  const c = search.get('c');
  const m = search.get('m');
  // URLSearchParams.get already returns decoded strings
  if (s) out.songId = s;
  if (c) out.chartId = c;
  if (m === 'single' || m === 'double') out.mode = m;

  // Legacy support: hash holds encoded title; query holds difficulty/mode
  const legacyTitle = location.hash ? decodeURIComponent(location.hash.substring(1)) : null;
  const titleParam = search.get('t');
  const diff = search.get('difficulty');
  const legacyMode = search.get('mode');
  if (!out.songId && (legacyTitle || titleParam)) {
    out.legacy = { title: legacyTitle || titleParam, difficulty: diff, mode: legacyMode };
  }
  return out;
}

export function buildBpmUrl({ pathname = '/bpm', songId, chartId, mode }) {
  const params = new URLSearchParams();
  if (songId) params.set('s', songId);
  if (chartId) params.set('c', chartId);
  if (mode && (mode === 'single' || mode === 'double')) params.set('m', mode);
  return `${pathname}?${params.toString()}`;
}

export function replaceLegacyUrl(navigate, location, songId, chartId, mode) {
  const url = buildBpmUrl({ pathname: location.pathname, songId, chartId, mode });
  navigate(url, { replace: true });
}
