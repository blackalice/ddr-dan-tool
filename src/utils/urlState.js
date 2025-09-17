// URL state helpers for song/chart selection
// Song ID: sm file path from smData.files[].path
// Chart ID: slug from simfileData.availableTypes[].slug

export function parseSelection(location) {
  const out = { songId: null, chartId: null, legacy: null };
  const search = new URLSearchParams(location.search || '');
  const song = search.get('song') || search.get('s');
  const chart = search.get('chart') || search.get('c');
  // URLSearchParams.get already returns decoded strings
  if (song) out.songId = song;
  if (chart) out.chartId = chart;

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

export function buildBpmUrl({ pathname = '/bpm', songId, chartId }) {
  const params = new URLSearchParams();
  if (songId) params.set('song', songId);
  if (chartId) params.set('chart', chartId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function replaceLegacyUrl(navigate, location, songId, chartId) {
  const url = buildBpmUrl({ pathname: location.pathname, songId, chartId });
  navigate(url, { replace: true });
}
