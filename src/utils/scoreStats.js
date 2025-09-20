import { buildChartId, normalizeMode, upgradeChartId } from './chartIds.js';
import { legacyScoreKey, makeScoreKey } from './scoreKey.js';

export const LEVELS = Array.from({ length: 19 }, (_, idx) => idx + 1);
export const AAA_THRESHOLD = 990000;

const DEFAULT_MODE_TOTALS = Object.freeze({
  played: 0,
  mfc: 0,
  pfc: 0,
  aaa: 0,
  fail: 0,
  other: 0,
});

const DEFAULT_MODE_SUMMARIES = Object.freeze(
  LEVELS.map(level => Object.freeze({
    level,
    total: 0,
    mfc: 0,
    pfc: 0,
    aaa: 0,
    fail: 0,
    other: 0,
  })),
);

export const EMPTY_MODE_STATS = Object.freeze({
  levelSummaries: DEFAULT_MODE_SUMMARIES,
  totals: DEFAULT_MODE_TOTALS,
  hasOther: false,
});

export const EMPTY_STATS_STATE = Object.freeze({
  single: EMPTY_MODE_STATS,
  double: EMPTY_MODE_STATS,
  updatedAt: null,
  ready: false,
});

const parseScore = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const cloneModeSummaries = () => DEFAULT_MODE_SUMMARIES.map(entry => ({ ...entry }));
const cloneModeTotals = () => ({ ...DEFAULT_MODE_TOTALS });

const normaliseLevel = (value) => {
  const level = Number(value);
  if (!Number.isFinite(level) || level < 1 || level > 19) return null;
  return level;
};

const addKey = (map, key, entry) => {
  if (typeof key !== 'string') return;
  const trimmed = key.trim();
  if (!trimmed || map.has(trimmed)) return;
  map.set(trimmed, entry);
};

export function buildChartMetaLookup(songMeta) {
  const map = new Map();
  if (!Array.isArray(songMeta)) return map;

  for (const song of songMeta) {
    const difficulties = Array.isArray(song?.difficulties) ? song.difficulties : [];
    for (const diff of difficulties) {
      const normalizedMode = normalizeMode(diff?.mode);
      if (normalizedMode !== 'single' && normalizedMode !== 'double') continue;

      const level = normaliseLevel(diff?.feet);
      if (!level) continue;

      const entry = {
        level,
        mode: normalizedMode,
      };

      const chartId = diff?.chartId;
      if (chartId) {
        addKey(map, chartId, entry);
        const upgraded = upgradeChartId(chartId);
        if (upgraded) addKey(map, upgraded, entry);
      }

      const builtId = buildChartId(song?.id, normalizedMode, diff?.difficulty);
      if (builtId) addKey(map, builtId, entry);

      const withArtist = makeScoreKey({
        title: song?.title,
        artist: song?.artist,
        difficulty: diff?.difficulty,
      });
      addKey(map, withArtist, entry);

      const legacy = legacyScoreKey({
        title: song?.title,
        difficulty: diff?.difficulty,
      });
      addKey(map, legacy, entry);
    }
  }

  return map;
}

function aggregateModeStats(sourceScores, normalizedMode, lookup) {
  const summaries = cloneModeSummaries();
  const totals = cloneModeTotals();

  if (!sourceScores || typeof sourceScores !== 'object') {
    return { levelSummaries: summaries, totals, hasOther: false };
  }

  const buckets = Object.create(null);
  for (const entry of summaries) {
    buckets[entry.level] = entry;
  }

  for (const [scoreKey, result] of Object.entries(sourceScores)) {
    if (!result) continue;

    const trimmedKey = typeof scoreKey === 'string' ? scoreKey.trim() : '';
    if (!trimmedKey) continue;

    const upgradedKey = upgradeChartId(trimmedKey);
    const meta = lookup.get(trimmedKey) || (upgradedKey ? lookup.get(upgradedKey) : null);
    if (!meta || meta.mode !== normalizedMode) continue;

    const level = meta.level;
    const bucket = buckets[level];
    if (!bucket) continue;

    const normalizedLamp = typeof result.lamp === 'string' ? result.lamp.toLowerCase() : '';
    if (normalizedLamp.includes('no play')) continue;

    bucket.total += 1;
    totals.played += 1;

    const scoreValue = parseScore(result.score);

    if (normalizedLamp.includes('marvelous')) {
      bucket.mfc += 1;
      totals.mfc += 1;
    } else if (normalizedLamp.includes('perfect')) {
      bucket.pfc += 1;
      totals.pfc += 1;
    } else if (normalizedLamp.includes('failed') || (!normalizedLamp && scoreValue == null)) {
      bucket.fail += 1;
      totals.fail += 1;
    } else if (scoreValue != null && scoreValue >= AAA_THRESHOLD) {
      bucket.aaa += 1;
      totals.aaa += 1;
    } else {
      bucket.other += 1;
      totals.other += 1;
    }
  }

  const hasOther = summaries.some(entry => entry.other > 0);

  return { levelSummaries: summaries, totals, hasOther };
}

export function computeStats(scores, lookup) {
  const normalizedScores = scores && typeof scores === 'object' ? scores : {};
  const effectiveLookup = lookup instanceof Map ? lookup : new Map();
  return {
    single: aggregateModeStats(normalizedScores.single, 'single', effectiveLookup),
    double: aggregateModeStats(normalizedScores.double, 'double', effectiveLookup),
  };
}

export function normaliseStatsState(value) {
  if (!value || typeof value !== 'object') return { ...EMPTY_STATS_STATE };
  const normaliseMode = (modeValue) => {
    if (!modeValue || typeof modeValue !== 'object') return { ...EMPTY_MODE_STATS };
    const levelSummaries = Array.isArray(modeValue.levelSummaries)
      ? modeValue.levelSummaries.map(entry => ({
        level: typeof entry?.level === 'number' ? entry.level : 0,
        total: Number(entry?.total) || 0,
        mfc: Number(entry?.mfc) || 0,
        pfc: Number(entry?.pfc) || 0,
        aaa: Number(entry?.aaa) || 0,
        fail: Number(entry?.fail) || 0,
        other: Number(entry?.other) || 0,
      }))
      : cloneModeSummaries();
    const totals = modeValue.totals && typeof modeValue.totals === 'object'
      ? {
        played: Number(modeValue.totals.played) || 0,
        mfc: Number(modeValue.totals.mfc) || 0,
        pfc: Number(modeValue.totals.pfc) || 0,
        aaa: Number(modeValue.totals.aaa) || 0,
        fail: Number(modeValue.totals.fail) || 0,
        other: Number(modeValue.totals.other) || 0,
      }
      : cloneModeTotals();
    return {
      levelSummaries,
      totals,
      hasOther: Boolean(modeValue.hasOther) && levelSummaries.some(entry => entry.other > 0),
    };
  };

  return {
    single: normaliseMode(value.single),
    double: normaliseMode(value.double),
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : null,
    ready: Boolean(value.ready),
  };
}

export function statsStatesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const stringify = (value) => JSON.stringify(value);
  return stringify({ single: a.single, double: a.double }) === stringify({ single: b.single, double: b.double });
}

export function serializeStatsState(value) {
  const payload = value && typeof value === 'object' ? value : EMPTY_STATS_STATE;
  return JSON.stringify(payload);
}

export function hydrateStatsState(raw) {
  if (typeof raw !== 'string') return { ...EMPTY_STATS_STATE };
  try {
    const parsed = JSON.parse(raw);
    return normaliseStatsState(parsed);
  } catch {
    return { ...EMPTY_STATS_STATE };
  }
}
