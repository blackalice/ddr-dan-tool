/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
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
      // Migrate old flat structure to new playstyle-separated format
      if (!parsed.single && !parsed.double) {
        return { single: parsed, double: {} };
      }
      return normalizeScoresShape(parsed);
    }
    return { ...EMPTY_SCORES };
  });

  const [stats, setStats] = useState(() => {
    const stored = storage.getItem(STATS_STORAGE_KEY);
    return hydrateStatsState(stored);
  });

  const [chartMetaLookup, setChartMetaLookup] = useState(() => new Map());

  useEffect(() => {
    const payload = JSON.stringify(scores);
    storage.setItem('ddrScores', payload);
    storage.setItem('scores', payload);
  }, [scores]);

  useEffect(() => {
    let cancelled = false;
    getSongMeta()
      .then(meta => {
        if (cancelled) return;
        setChartMetaLookup(buildChartMetaLookup(meta));
        setScores(prev => migrateScores(prev, meta));
      })
      .catch(() => { /* noop */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!(chartMetaLookup instanceof Map) || chartMetaLookup.size === 0) {
      setStats(prev => {
        if (prev.ready) return prev;
        return { ...prev, ready: true };
      });
      return;
    }

    const computed = computeStats(scores, chartMetaLookup);
    setStats(prev => {
      const next = {
        single: computed.single,
        double: computed.double,
        updatedAt: Date.now(),
        ready: true,
      };
      if (statsStatesEqual(prev, next) && prev.ready) {
        return prev;
      }
      return next;
    });
  }, [scores, chartMetaLookup]);

  useEffect(() => {
    if (!stats || typeof stats !== 'object') return;
    storage.setItem(STATS_STORAGE_KEY, serializeStatsState(stats));
  }, [stats]);

  const contextValue = useMemo(() => ({
    scores,
    setScores,
    stats: stats && typeof stats === 'object' ? stats : { ...EMPTY_STATS_STATE },
  }), [scores, stats]);

  return (
    <ScoresContext.Provider value={contextValue}>
      {children}
    </ScoresContext.Provider>
  );
};

export const useScores = () => useContext(ScoresContext);
