import { normalizeSongIdValue } from './songId.js';

export function normalizeDifficultyName(difficulty) {
  return String(difficulty || '')
    .trim()
    .toLowerCase();
}

export function normalizeMode(mode) {
  const m = String(mode || '').trim().toLowerCase();
  if (m === 's' || m === 'sp' || m === 'single') return 'single';
  if (m === 'd' || m === 'dp' || m === 'double') return 'double';
  return m;
}

const MODE_TO_CODE = {
  single: 'S',
  double: 'D',
};

const CODE_TO_MODE = {
  S: 'single',
  D: 'double',
};

const DIFFICULTY_TO_CODE = new Map([
  ['beginner', '0'],
  ['basic', '1'],
  ['difficult', '2'],
  ['expert', '4'],
  ['challenge', '5'],
  ['edit', '6'],
]);
const CODE_TO_DIFFICULTY = new Map(
  Array.from(DIFFICULTY_TO_CODE.entries(), ([name, code]) => [code, name]),
);

const NEW_CHART_ID_REGEX = /^(\d{6})#([SD])#(\d+)$/;
const LEGACY_CHART_ID_REGEX = /^(SONG-\d+|\d{1,6})#(single|double)#([^#]+)$/i;

function encodeMode(mode) {
  const normalizedMode = normalizeMode(mode);
  return MODE_TO_CODE[normalizedMode] || null;
}

function decodeMode(code) {
  if (!code) return null;
  return CODE_TO_MODE[String(code).toUpperCase()] || null;
}

function encodeDifficulty(difficulty) {
  const normalized = normalizeDifficultyName(difficulty);
  if (!normalized) return null;
  if (DIFFICULTY_TO_CODE.has(normalized)) {
    return DIFFICULTY_TO_CODE.get(normalized);
  }
  return null;
}

function decodeDifficulty(code) {
  if (code == null) return null;
  const normalized = String(code);
  if (CODE_TO_DIFFICULTY.has(normalized)) {
    return CODE_TO_DIFFICULTY.get(normalized);
  }
  return null;
}

function parseLegacyChartId(chartId) {
  const match = chartId.match(LEGACY_CHART_ID_REGEX);
  if (!match) return null;
  const [, songIdRaw, modeRaw, difficultyRaw] = match;
  const songId = normalizeSongIdValue(songIdRaw);
  const mode = normalizeMode(modeRaw);
  const difficulty = normalizeDifficultyName(difficultyRaw);
  if (!songId || !mode || !difficulty) return null;
  return {
    songId,
    mode,
    difficulty,
    difficultyCode: encodeDifficulty(difficulty),
  };
}

export function buildChartId(songId, mode, difficulty) {
  const normalizedSongId = normalizeSongIdValue(songId);
  if (!normalizedSongId) return null;
  const modeCode = encodeMode(mode);
  const difficultyCode = encodeDifficulty(difficulty);
  if (!modeCode || difficultyCode == null) return null;
  return `${normalizedSongId}#${modeCode}#${difficultyCode}`;
}

export function isChartId(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return NEW_CHART_ID_REGEX.test(trimmed) || LEGACY_CHART_ID_REGEX.test(trimmed);
}

export function parseChartId(chartId) {
  if (typeof chartId !== 'string') return null;
  const trimmed = chartId.trim();
  const modern = trimmed.match(NEW_CHART_ID_REGEX);
  if (modern) {
    const [, songId, modeCode, difficultyCode] = modern;
    const mode = decodeMode(modeCode);
    const difficulty = decodeDifficulty(difficultyCode);
    return {
      songId,
      mode,
      difficulty,
      difficultyCode,
    };
  }
  return parseLegacyChartId(trimmed);
}

export function upgradeChartId(chartId) {
  const parsed = parseChartId(chartId);
  if (!parsed) return null;
  const { songId, mode, difficulty } = parsed;
  return buildChartId(songId, mode, difficulty);
}
