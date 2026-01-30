/* eslint react-refresh/only-export-components: off */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { storage } from '../utils/remoteStorage.js';
import { getJsonCached, getSongMeta } from '../utils/cachedFetch.js';
import { makeScoreKey, legacyScoreKey } from '../utils/scoreKey.js';
import { buildChartId, isChartId, normalizeMode, upgradeChartId } from '../utils/chartIds.js';
import { normalizeSongIdValue } from '../utils/songId.js';
import { SettingsContext } from './SettingsContext.jsx';
import { applyWorldDifficultyChanges } from '../utils/worldDifficultyChanges.js';
import { applyWorldNewChallengeCharts } from '../utils/worldNewChallengeCharts.js';
import { normalizeString } from '../utils/stringSimilarity.js';
import {
  buildChartMetaLookup,
  computeStats,
  EMPTY_STATS_STATE,
  hydrateStatsState,
  serializeStatsState,
  statsStatesEqual,
} from '../utils/scoreStats.js';

const EMPTY_SCORES = { single: {}, double: {} };
const MIN_CHART_META_ENTRIES = 1000;

function normalizeScoresShape(data) {
  if (!data || typeof data !== 'object') return { ...EMPTY_SCORES };
  if (!data.single && !data.double) {
    return {
      single: data.single ? { ...data.single } : { ...data },
      double: {},
    };
  }
  return {
    single: data.single ? { ...data.single } : {},
    double: data.double ? { ...data.double } : {},
  };
}

function buildLegacyLookup(meta) {
  const map = new Map();
  if (!Array.isArray(meta)) return map;
  for (const song of meta) {
    const songId = song.id;
    for (const diff of song.difficulties || []) {
      const chartId = diff.chartId || buildChartId(songId, diff.mode, diff.difficulty);
      if (!chartId) continue;
      const withArtist = makeScoreKey({ title: song.title, artist: song.artist, difficulty: diff.difficulty });
      if (withArtist) map.set(withArtist, chartId);
      const legacy = legacyScoreKey({ title: song.title, difficulty: diff.difficulty });
      if (legacy) map.set(legacy, chartId);
    }
  }
  return map;
}

function migrateScores(existing, meta) {
  if (!meta || meta.length === 0) return existing;
  const lookup = buildLegacyLookup(meta);
  if (lookup.size === 0) return existing;
  const next = normalizeScoresShape(existing);
  let changed = false;
  for (const mode of ['single', 'double']) {
    const normalizedMode = normalizeMode(mode);
    const source = next[normalizedMode] || {};
    for (const key of Object.keys(source)) {
      if (isChartId(key)) {
        const upgraded = upgradeChartId(key);
        if (upgraded && upgraded !== key) {
          if (!source[upgraded]) {
            const entry = source[key];
            if (entry && typeof entry === 'object') {
              const normalizedSongId = normalizeSongIdValue(entry.songId);
              if (normalizedSongId) entry.songId = normalizedSongId;
            }
            source[upgraded] = source[key];
          }
          delete source[key];
          changed = true;
          continue;
        }
        const entry = source[key];
        if (entry && typeof entry === 'object') {
          const normalizedSongId = normalizeSongIdValue(entry.songId);
          if (normalizedSongId) entry.songId = normalizedSongId;
        }
        continue;
      }
      const mapped = lookup.get(key);
      if (!mapped) continue;
      if (!source[mapped]) {
        source[mapped] = source[key];
      }
      const entry = source[mapped];
      if (entry && typeof entry === 'object') {
        const normalizedSongId = normalizeSongIdValue(entry.songId);
        if (normalizedSongId) entry.songId = normalizedSongId;
      }
      delete source[key];
      changed = true;
    }
  }
  return changed ? { single: { ...next.single }, double: { ...next.double } } : existing;
}

export const ScoresContext = createContext();

const STATS_STORAGE_KEY = 'scoreStats';
const RANKINGS_PATH = '/combined_song_ratings.json';

function buildRatingMap(data, key) {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const entry of data) {
    const norm = normalizeString(entry?.song_name || '');
    if (!norm) continue;
    const val = entry?.[key];
    if (!map.has(norm)) map.set(norm, []);
    if (Array.isArray(val)) {
      map.get(norm).push(...val.map(Number));
    } else if (val !== undefined && val !== null) {
      map.get(norm).push(Number(val));
    }
  }
  return map;
}

function pickRatingForLevel(ratings, level) {
  if (!Array.isArray(ratings) || ratings.length === 0) return null;
  const idx = ratings.findIndex((r) => Math.floor(r) === level);
  if (idx !== -1) {
    const val = ratings[idx];
    ratings.splice(idx, 1);
    return val;
  }
  return ratings.shift();
}

export const ScoresProvider = ({ children }) => {
  const settings = useContext(SettingsContext) || {};
  const worldDifficultyChanges = Boolean(settings.worldDifficultyChanges);
  const worldRemoveChallengeCharts = Boolean(settings.worldRemoveChallengeCharts);
  const worldMetaKey = `${worldDifficultyChanges ? 1 : 0}:${worldRemoveChallengeCharts ? 1 : 0}`;

  const [scores, setScores] = useState(() => {
    const saved = storage.getItem('ddrScores');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.single && !parsed.double) {
        return { single: parsed, double: {} };
      }
      return normalizeScoresShape(parsed);
    }
    return { ...EMPTY_SCORES };
  });

  const [stats, setStats] = useState(() => {
    const stored = storage.getItem(STATS_STORAGE_KEY);
    const hydrated = hydrateStatsState(stored);
    // Never trust persisted readiness; force recompute after load
    return { ...hydrated, ready: false };
  });

  const [rawSongMeta, setRawSongMeta] = useState([]);
  const [songMeta, setSongMeta] = useState([]);
  const [songMetaWorldFlag, setSongMetaWorldFlag] = useState(null);
  const [chartMetaLookup, setChartMetaLookup] = useState(() => new Map());
  const rankedRatingsRef = useRef(null);
  const rankedRatingsPromiseRef = useRef(null);
  const songMetaPromiseRef = useRef(null);
  const chartMetaPromiseRef = useRef(null);
  const scoresRef = useRef(scores);
  const statsDirtyRef = useRef(true);
  const autoStatsControllerRef = useRef(null);
  const statsRetryTimerRef = useRef(null);
  const [statsRetryToken, setStatsRetryToken] = useState(0);

  useEffect(() => {
    const payload = JSON.stringify(scores);
    storage.setItem('ddrScores', payload);
    try { storage.setItem('ddrScoresUpdatedAt', String(Date.now())); } catch { /* noop */ }
  }, [scores]);

  useLayoutEffect(() => {
    scoresRef.current = scores;
    statsDirtyRef.current = true;
  }, [scores]);

  useEffect(() => {
    if (!stats || typeof stats !== 'object') return;
    storage.setItem(STATS_STORAGE_KEY, serializeStatsState(stats));
  }, [stats]);

  const applyWorldMetaChanges = useCallback((meta) => {
    const withWorldChanges = applyWorldDifficultyChanges(meta, worldDifficultyChanges);
    return applyWorldNewChallengeCharts(withWorldChanges, !worldRemoveChallengeCharts);
  }, [worldDifficultyChanges, worldRemoveChallengeCharts]);

  const loadRankedRatings = useCallback(async () => {
    if (rankedRatingsRef.current) return rankedRatingsRef.current;
    if (rankedRatingsPromiseRef.current) return rankedRatingsPromiseRef.current;
    const promise = getJsonCached(RANKINGS_PATH)
      .then((data) => {
        const result = {
          single: buildRatingMap(data, 'single_rankings'),
          double: buildRatingMap(data, 'doubles_rankings'),
        };
        rankedRatingsRef.current = result;
        return result;
      })
      .catch((err) => {
        console.warn('[scores] Failed to load ranked ratings', err);
        return null;
      })
      .finally(() => {
        rankedRatingsPromiseRef.current = null;
      });
    rankedRatingsPromiseRef.current = promise;
    return promise;
  }, []);

  const applyRankedRatings = useCallback(async (meta) => {
    if (!Array.isArray(meta) || meta.length === 0) return meta;
    const ratings = await loadRankedRatings();
    if (!ratings) return meta;
    let changed = false;
    const next = meta.map((song) => {
      const key = normalizeString(song?.title || '');
      const single = ratings.single.get(key);
      const double = ratings.double.get(key);
      if (!single && !double) return song;
      const pools = {
        single: single ? [...single] : null,
        double: double ? [...double] : null,
      };
      if (!Array.isArray(song?.difficulties)) return song;
      let songChanged = false;
      const difficulties = song.difficulties.map((diff) => {
        const pool = pools[diff.mode];
        if (!pool || pool.length === 0) return diff;
        const rated = pickRatingForLevel(pool, diff.feet);
        if (!Number.isFinite(rated) || diff.rankedRating === rated) return diff;
        songChanged = true;
        return { ...diff, rankedRating: rated };
      });
      if (!songChanged) return song;
      changed = true;
      return { ...song, difficulties };
    });
    return changed ? next : meta;
  }, [loadRankedRatings]);

  const loadSongMeta = useCallback(async () => {
    if (
      Array.isArray(songMeta) &&
      songMeta.length > 0 &&
      songMetaWorldFlag === worldMetaKey
    ) {
      return songMeta;
    }
    if (Array.isArray(rawSongMeta) && rawSongMeta.length > 0) {
      const corrected = await applyRankedRatings(rawSongMeta);
      const applied = applyWorldMetaChanges(corrected);
      setRawSongMeta(corrected);
      setSongMeta(applied);
      setSongMetaWorldFlag(worldMetaKey);
      return applied;
    }
    if (songMetaPromiseRef.current) {
      return songMetaPromiseRef.current;
    }
    const promise = getSongMeta()
      .then(meta => {
        if (!Array.isArray(meta) || meta.length < MIN_CHART_META_ENTRIES) {
          throw new Error(`[scores] song metadata incomplete (length=${Array.isArray(meta) ? meta.length : 'unknown'})`);
        }
        return applyRankedRatings(meta).then((corrected) => {
          const normalized = corrected || meta;
          setRawSongMeta(normalized);
          const applied = applyWorldMetaChanges(normalized);
          setSongMeta(applied);
          setSongMetaWorldFlag(worldMetaKey);
          return applied;
        });
      })
      .catch(err => {
        console.warn('[scores] Failed to load song metadata', err);
        throw err;
      })
      .finally(() => {
        songMetaPromiseRef.current = null;
      });
    songMetaPromiseRef.current = promise;
    return promise;
  }, [applyRankedRatings, applyWorldMetaChanges, rawSongMeta, songMeta, songMetaWorldFlag, worldMetaKey]);

  useEffect(() => {
    if (!rawSongMeta.length) return;
    const applied = applyWorldMetaChanges(rawSongMeta);
    setSongMeta(applied);
    setSongMetaWorldFlag(worldMetaKey);
    setChartMetaLookup(new Map());
    statsDirtyRef.current = true;
  }, [applyWorldMetaChanges, rawSongMeta, worldMetaKey]);

  const loadChartMeta = useCallback(async () => {
    if (chartMetaLookup instanceof Map && chartMetaLookup.size > 0) {
      return chartMetaLookup;
    }
    if (chartMetaPromiseRef.current) {
      return chartMetaPromiseRef.current;
    }
    const promise = loadSongMeta()
      .then(meta => {
        if (!Array.isArray(meta) || meta.length < MIN_CHART_META_ENTRIES) {
          throw new Error(`[scores] chart metadata incomplete (length=${Array.isArray(meta) ? meta.length : 'unknown'})`);
        }
        const lookup = buildChartMetaLookup(meta);
        if (!(lookup instanceof Map) || lookup.size < MIN_CHART_META_ENTRIES) {
          throw new Error(`[scores] chart metadata lookup incomplete (size=${lookup instanceof Map ? lookup.size : 'n/a'})`);
        }
        setChartMetaLookup(lookup);
        setScores(prev => migrateScores(prev, meta));
        statsDirtyRef.current = true;
        return lookup;
      })
      .catch(err => {
        console.warn('[scores] Failed to load chart metadata', err);
        throw err;
      })
      .finally(() => {
        chartMetaPromiseRef.current = null;
      });
    chartMetaPromiseRef.current = promise;
    return promise;
  }, [chartMetaLookup, setScores, loadSongMeta]);

  const runStatsComputation = useCallback(async (options = {}) => {
    const { signal } = options;
    const lookup = await loadChartMeta();
    if (signal?.aborted) return stats;
    const latestScores = scoresRef.current;
    const computed = computeStats(latestScores, lookup);
    const next = {
      single: computed.single,
      double: computed.double,
      updatedAt: Date.now(),
      ready: true,
    };
    statsDirtyRef.current = false;
    setStats(prev => {
      if (statsStatesEqual(prev, next) && prev.ready) {
        return prev;
      }
      return next;
    });
    return next;
  }, [loadChartMeta, stats]);

  const ensureStats = useCallback(async (options = {}) => {
    const { force = false, signal } = options;
    if (!force && !statsDirtyRef.current && stats?.ready) {
      return stats;
    }
    if (signal?.aborted) {
      return stats;
    }
    return runStatsComputation(options);
  }, [runStatsComputation, stats]);

  useEffect(() => {
    if (!statsDirtyRef.current) return;

    if (autoStatsControllerRef.current && typeof autoStatsControllerRef.current.abort === 'function') {
      autoStatsControllerRef.current.abort();
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (controller) {
      autoStatsControllerRef.current = controller;
    } else {
      autoStatsControllerRef.current = null;
    }

    if (statsRetryTimerRef.current) {
      clearTimeout(statsRetryTimerRef.current);
      statsRetryTimerRef.current = null;
    }

    runStatsComputation({ signal: controller?.signal }).catch((err) => {
      if (controller?.signal?.aborted) return;
      if (statsRetryTimerRef.current) {
        clearTimeout(statsRetryTimerRef.current);
      }
      const delay = err?.message?.includes('metadata') ? 750 : 1250;
      statsRetryTimerRef.current = setTimeout(() => {
        statsRetryTimerRef.current = null;
        setStatsRetryToken(token => token + 1);
      }, delay);
    });

    return () => {
      if (autoStatsControllerRef.current === controller) {
        autoStatsControllerRef.current = null;
      }
      if (controller && typeof controller.abort === 'function') {
        controller.abort();
      }
      if (statsRetryTimerRef.current) {
        clearTimeout(statsRetryTimerRef.current);
        statsRetryTimerRef.current = null;
      }
    };
  }, [scores, runStatsComputation, statsRetryToken]);

  const contextValue = useMemo(() => ({
    scores,
    setScores,
    stats: stats && typeof stats === 'object' ? stats : { ...EMPTY_STATS_STATE },
    ensureStats,
    loadChartMeta,
    loadSongMeta,
  }), [scores, stats, ensureStats, loadChartMeta, loadSongMeta]);

  return (
    <ScoresContext.Provider value={contextValue}>
      {children}
    </ScoresContext.Provider>
  );
};

export const useScores = () => useContext(ScoresContext);
