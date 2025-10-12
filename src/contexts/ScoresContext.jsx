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
import { getSongMeta } from '../utils/cachedFetch.js';
import { makeScoreKey, legacyScoreKey } from '../utils/scoreKey.js';
import { buildChartId, isChartId, normalizeMode, upgradeChartId } from '../utils/chartIds.js';
import { normalizeSongIdValue } from '../utils/songId.js';
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

export const ScoresProvider = ({ children }) => {
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

  const [chartMetaLookup, setChartMetaLookup] = useState(() => new Map());
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

  const loadChartMeta = useCallback(async () => {
    if (chartMetaLookup instanceof Map && chartMetaLookup.size > 0) {
      return chartMetaLookup;
    }
    if (chartMetaPromiseRef.current) {
      return chartMetaPromiseRef.current;
    }
    const promise = getSongMeta()
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
  }, [chartMetaLookup, setScores]);

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
  }), [scores, stats, ensureStats, loadChartMeta]);

  return (
    <ScoresContext.Provider value={contextValue}>
      {children}
    </ScoresContext.Provider>
  );
};

export const useScores = () => useContext(ScoresContext);
