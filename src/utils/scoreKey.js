import {
  buildChartId,
  isChartId,
  normalizeDifficultyName,
  normalizeMode,
  upgradeChartId,
} from './chartIds.js';
import { buildChartKey, normalizeSongKey } from './chartIdentity.js';

function makeLegacyKey({ title, difficulty, artist }) {
  if (!title || !difficulty) return null;
  const t = String(title).toLowerCase();
  const d = normalizeDifficultyName(difficulty);
  if (artist) {
    const a = String(artist).toLowerCase();
    return `${t}::${a}::${d}`;
  }
  return `${t}-${d}`;
}

export function makeScoreKey({ chartKey, songKey, path, chartId, songId, mode, difficulty, title, artist }) {
  if (chartKey) return String(chartKey);
  const canonicalSongKey = normalizeSongKey(songKey || path);
  const canonicalChartKey = buildChartKey(canonicalSongKey, mode, difficulty);
  if (canonicalChartKey) return canonicalChartKey;
  if (chartId && isChartId(chartId)) {
    const upgraded = upgradeChartId(chartId);
    if (upgraded) return upgraded;
    return chartId;
  }
  const normalizedMode = normalizeMode(mode);
  const normalizedDifficulty = normalizeDifficultyName(difficulty);
  if (songId && normalizedMode && normalizedDifficulty) {
    const id = buildChartId(songId, normalizedMode, normalizedDifficulty);
    if (id) return id;
  }
  return makeLegacyKey({ title, difficulty, artist });
}

export function legacyScoreKey({ title, difficulty }) {
  return makeLegacyKey({ title, difficulty });
}

export function resolveScore(scores, mode, details = {}) {
  if (!scores || !mode) return null;
  const normalizedMode = normalizeMode(mode);
  const byMode = scores[normalizedMode] || {};
  if (!details) details = {};
  const { chartKey, songKey, path, chartId, songId, difficulty, title, artist } = details;

  const keyFromDetails = makeScoreKey({ chartKey, songKey, path, chartId, songId, mode: normalizedMode, difficulty, title, artist });
  if (keyFromDetails && byMode[keyFromDetails]) return byMode[keyFromDetails];

  const legacyWithArtist = makeLegacyKey({ title, difficulty, artist });
  if (legacyWithArtist && byMode[legacyWithArtist]) return byMode[legacyWithArtist];

  const legacy = legacyScoreKey({ title, difficulty });
  if (legacy && byMode[legacy]) return byMode[legacy];

  const normalizedDifficulty = normalizeDifficultyName(difficulty);
  const builtId = buildChartId(songId, normalizedMode, normalizedDifficulty);
  const normalizedChartId = chartId ? upgradeChartId(chartId) : null;
  for (const [key, val] of Object.entries(byMode)) {
    const upgradedKey = upgradeChartId(key) || key;
    if (normalizedChartId && upgradedKey === normalizedChartId) return val;
    if (builtId && upgradedKey === builtId) return val;
    if (chartId && key === chartId) return val;
    if (builtId && key === builtId) return val;
    if (title && normalizedDifficulty) {
      const t = String(title).toLowerCase();
      if (key === `${t}-${normalizedDifficulty}`) return val;
      if (key.startsWith(`${t}::`) && key.endsWith(`::${normalizedDifficulty}`)) return val;
    }
  }
  return null;
}
