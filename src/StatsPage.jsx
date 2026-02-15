import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { useScores } from './contexts/ScoresContext.jsx';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { LEVELS } from './utils/scoreStats.js';
import { upgradeChartId } from './utils/chartIds.js';
import {
  SONGLIST_OVERRIDE_OPTIONS,
  buildSonglistOverrideLookup,
  songlistOverrideHasEntries,
  songlistOverrideMatches,
} from './utils/songlistOverrides.js';
import { getJsonCached } from './utils/cachedFetch.js';
import { buildBpmUrl } from './utils/urlState.js';
import { getGrade } from './utils/grades.js';
import './StatsPage.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const DEFAULT_CHART_COLORS = {
  mfc: '#F472B6',
  pfc: '#FBBF24',
  aaa: '#60A5FA',
  other: '#34D399',
  fail: '#EF4444',
  axis: '#9CA3AF',
  grid: 'rgba(148, 163, 184, 0.25)',
  tooltipBg: 'rgba(17, 24, 39, 0.92)',
  tooltipText: '#F9FAFB',
};

const BPM_BUCKETS = [
  { label: '<120', min: 0, max: 119 },
  { label: '120-139', min: 120, max: 139 },
  { label: '140-159', min: 140, max: 159 },
  { label: '160-179', min: 160, max: 179 },
  { label: '180-199', min: 180, max: 199 },
  { label: '200-219', min: 200, max: 219 },
  { label: '220+', min: 220, max: Infinity },
];

const CROSSOVER_BUCKETS = [
  { label: '0', min: 0, max: 0 },
  { label: '1-4', min: 1, max: 4 },
  { label: '5-9', min: 5, max: 9 },
  { label: '10-19', min: 10, max: 19 },
  { label: '20-39', min: 20, max: 39 },
  { label: '40-59', min: 40, max: 59 },
  { label: '60+', min: 60, max: Infinity },
];

const NPS_BUCKETS = [
  { label: '<3.0', min: 0, max: 2.99 },
  { label: '3.0-3.9', min: 3.0, max: 3.99 },
  { label: '4.0-4.9', min: 4.0, max: 4.99 },
  { label: '5.0-5.9', min: 5.0, max: 5.99 },
  { label: '6.0-6.9', min: 6.0, max: 6.99 },
  { label: '7.0-7.9', min: 7.0, max: 7.99 },
  { label: '8.0+', min: 8.0, max: Infinity },
];

const formatMetricValue = (value, digits = 1) => {
  if (!Number.isFinite(value)) return 'N/A';
  return value.toFixed(digits);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getRepresentativeBpm = (meta) => {
  const bpmMin = Number(meta?.bpmMin);
  const bpmMax = Number(meta?.bpmMax);
  const hasMin = Number.isFinite(bpmMin) && bpmMin > 0;
  const hasMax = Number.isFinite(bpmMax) && bpmMax > 0;
  if (hasMin && hasMax) return (bpmMin + bpmMax) / 2;
  if (hasMax) return bpmMax;
  return hasMin ? bpmMin : NaN;
};

const PERFECT_FEATURES = [
  { key: 'bpm', label: 'BPM', scale: 40, weight: 1.3, get: (meta) => getRepresentativeBpm(meta) },
  { key: 'crossovers', label: 'XO', scale: 20, weight: 1.0, get: (meta) => Number(meta?.crossovers) },
  { key: 'notesPerSecond', label: 'NPS', scale: 1.3, weight: 1.25, get: (meta) => Number(meta?.notesPerSecond) },
  { key: 'jumps', label: 'Jumps', scale: 30, weight: 0.9, get: (meta) => Number(meta?.jumps) },
  { key: 'holds', label: 'Holds', scale: 20, weight: 0.75, get: (meta) => Number(meta?.holds) },
  { key: 'footswitches', label: 'Footswitches', scale: 10, weight: 0.8, get: (meta) => Number(meta?.footswitches) },
  { key: 'doublesteps', label: 'Doublesteps', scale: 10, weight: 0.8, get: (meta) => Number(meta?.doublesteps) },
  { key: 'streamNotes', label: 'Stream Notes', scale: 80, weight: 0.9, get: (meta) => Number(meta?.streamNotes) },
];

const stdDeviation = (values) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
};

const parseScoreValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const pickBucketIndex = (value, buckets) => {
  if (!Number.isFinite(value) || value < 0) return -1;
  return buckets.findIndex((bucket) => value >= bucket.min && value <= bucket.max);
};

const readCssVariable = (name, fallback) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value ? value.trim() || fallback : fallback;
  } catch {
    return fallback;
  }
};

const GRADE_THRESHOLDS = [
  { grade: 'D+', threshold: 550000 },
  { grade: 'C-', threshold: 590000 },
  { grade: 'C', threshold: 600000 },
  { grade: 'C+', threshold: 650000 },
  { grade: 'B-', threshold: 690000 },
  { grade: 'B', threshold: 700000 },
  { grade: 'B+', threshold: 750000 },
  { grade: 'A-', threshold: 790000 },
  { grade: 'A', threshold: 800000 },
  { grade: 'A+', threshold: 850000 },
  { grade: 'AA-', threshold: 890000 },
  { grade: 'AA', threshold: 900000 },
  { grade: 'AA+', threshold: 950000 },
  { grade: 'AAA', threshold: 990000 },
];

const LAMP_TARGETS = [
  { rank: 0, label: 'Good FC' },
  { rank: 1, label: 'Great FC' },
  { rank: 2, label: 'PFC' },
  { rank: 3, label: 'MFC' },
];

const SKILL_SIGNATURES = [
  { key: 'speed', label: 'Speed', get: (meta) => Number(meta?.notesPerSecond) },
  { key: 'crossovers', label: 'Crossovers', get: (meta) => Number(meta?.crossovers) },
  { key: 'footswitches', label: 'Footswitches', get: (meta) => Number(meta?.footswitches) },
  { key: 'doublesteps', label: 'Doublesteps', get: (meta) => Number(meta?.doublesteps) },
  { key: 'stream', label: 'Stream', get: (meta) => Number(meta?.streamNotes) },
  { key: 'jumps', label: 'Jump-heavy', get: (meta) => Number(meta?.jumps) },
];

const TECH_PENALTY_FEATURES = [
  { key: 'maximumNotesPerSecond', label: 'Max NPS' },
  { key: 'notesPerSecond', label: 'Mean NPS' },
  { key: 'crossovers', label: 'Crossovers' },
  { key: 'footswitches', label: 'Footswitches' },
  { key: 'doublesteps', label: 'Doublesteps' },
  { key: 'jacks', label: 'Jacks' },
  { key: 'drills', label: 'Drills' },
  { key: 'stops', label: 'Stops' },
  { key: 'spins360', label: 'Spins 360' },
  { key: 'technicalMoves', label: 'Technical Moves' },
];

const safeNumber = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const mean = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const percentile = (values, ratio) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = clamp((sorted.length - 1) * ratio, 0, sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return (sorted[lower] * (1 - weight)) + (sorted[upper] * weight);
};

const pearsonCorrelation = (xValues, yValues) => {
  if (!Array.isArray(xValues) || !Array.isArray(yValues) || xValues.length !== yValues.length || xValues.length < 3) {
    return null;
  }
  const xMean = mean(xValues);
  const yMean = mean(yValues);
  if (xMean == null || yMean == null) return null;

  let numerator = 0;
  let xDenominator = 0;
  let yDenominator = 0;
  for (let i = 0; i < xValues.length; i += 1) {
    const xDelta = xValues[i] - xMean;
    const yDelta = yValues[i] - yMean;
    numerator += xDelta * yDelta;
    xDenominator += xDelta ** 2;
    yDenominator += yDelta ** 2;
  }

  if (xDenominator <= 0 || yDenominator <= 0) return null;
  return numerator / Math.sqrt(xDenominator * yDenominator);
};

const getLampRank = (lampRaw) => {
  const lamp = String(lampRaw || '').toLowerCase();
  if (lamp.includes('marvelous')) return 3;
  if (lamp.includes('perfect')) return 2;
  if (lamp.includes('great')) return 1;
  if (lamp.includes('good')) return 0;
  return -1;
};

const getLampLabel = (rank) => {
  const found = LAMP_TARGETS.find((entry) => entry.rank === rank);
  return found ? found.label : 'Clear';
};

const getNextLampTarget = (rank) => {
  return LAMP_TARGETS.find((entry) => entry.rank > rank) || null;
};

const getNextGradeTarget = (score) => {
  if (!Number.isFinite(score)) return null;
  return GRADE_THRESHOLDS.find((entry) => entry.threshold > score) || null;
};

const getCoverageClassName = (coveragePct) => {
  if (!Number.isFinite(coveragePct)) return 'stats-heat-none';
  if (coveragePct >= 70) return 'stats-heat-high';
  if (coveragePct >= 40) return 'stats-heat-mid';
  if (coveragePct > 0) return 'stats-heat-low';
  return 'stats-heat-none';
};

const formatSigned = (value) => {
  if (!Number.isFinite(value)) return 'N/A';
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded.toLocaleString()}`;
  return rounded.toLocaleString();
};

const computeComplexityScore = (meta) => {
  const bpmMin = safeNumber(meta?.bpmMin);
  const bpmMax = safeNumber(meta?.bpmMax, bpmMin);
  const bpmFloor = bpmMin > 0 ? bpmMin : (bpmMax > 0 ? bpmMax : 0);
  const bpmCeil = bpmMax > 0 ? bpmMax : bpmFloor;
  const bpmSpan = Math.max(0, bpmCeil - bpmFloor);
  const representativeBpm = bpmFloor > 0 && bpmCeil > 0
    ? (bpmFloor + bpmCeil) / 2
    : Math.max(bpmFloor, bpmCeil);
  const bpmVolatility = representativeBpm > 0 ? (bpmSpan / representativeBpm) : 0;
  const bpmShiftPressure = (Math.sqrt(bpmSpan) * 11) + (bpmVolatility * 160);

  const complexity = (
    1
    + (safeNumber(meta?.technicalMoves) * 3)
    + (safeNumber(meta?.notesPerSecond) * 110)
    + (safeNumber(meta?.maximumNotesPerSecond) * 35)
    + (safeNumber(meta?.crossovers) * 1.5)
    + (safeNumber(meta?.doublesteps) * 2)
    + (safeNumber(meta?.stops) * 18)
    + bpmShiftPressure
    + (safeNumber(meta?.rankedRating, safeNumber(meta?.level)) * 70)
  );
  return Number.isFinite(complexity) && complexity > 0 ? complexity : null;
};

const StatsPage = () => {
  const {
    playStyle,
    theme,
    worldDifficultyChanges,
    worldRemoveChallengeCharts,
    songlistOverride,
    showTransliterationBeta,
  } = useContext(SettingsContext);
  const { stats, scores, ensureStats, loadChartMeta } = useScores();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chartMetaLookup, setChartMetaLookup] = useState(() => new Map());
  const [overrideSongs, setOverrideSongs] = useState(null);
  const [selectedStatView, setSelectedStatView] = useState('resultsByLevel');

  const normalizedPlayStyle = playStyle === 'double' ? 'double' : 'single';
  const modeStats = stats && typeof stats === 'object' ? stats[normalizedPlayStyle] : null;

  const levelSummaries = Array.isArray(modeStats?.levelSummaries)
    ? modeStats.levelSummaries
    : LEVELS.map(level => ({ level, total: 0, mfc: 0, pfc: 0, aaa: 0, fail: 0, other: 0 }));

  const totals = modeStats?.totals && typeof modeStats.totals === 'object'
    ? modeStats.totals
    : { played: 0, mfc: 0, pfc: 0, aaa: 0, fail: 0, other: 0 };

  const hasOther = Boolean(modeStats?.hasOther) || levelSummaries.some(entry => entry.other > 0);
  const statsReady = Boolean(stats?.ready);
  const hasScores = totals.played > 0;

  const hasUploadedScores = useMemo(() => {
    if (!scores || typeof scores !== 'object') return false;
    return ['single', 'double'].some(mode => {
      const entries = scores?.[mode];
      return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
    });
  }, [scores]);

  useEffect(() => {
    if (!user || typeof ensureStats !== 'function') {
      setChartMetaLookup(new Map());
      return undefined;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    ensureStats({ signal: controller?.signal }).catch(() => {});
    if (typeof loadChartMeta === 'function') {
      loadChartMeta()
        .then((lookup) => {
          if (controller?.signal?.aborted) return;
          if (lookup instanceof Map) setChartMetaLookup(lookup);
        })
        .catch(() => {});
    }
    return () => {
      controller?.abort();
    };
  }, [ensureStats, loadChartMeta, scores, user, worldDifficultyChanges, worldRemoveChallengeCharts]);

  useEffect(() => {
    const option = SONGLIST_OVERRIDE_OPTIONS.find((opt) => opt.value === songlistOverride);
    if (!option?.file) {
      setOverrideSongs(null);
      return;
    }
    getJsonCached(option.file)
      .then((data) => {
        setOverrideSongs(buildSonglistOverrideLookup(data));
      })
      .catch(() => {
        setOverrideSongs(null);
      });
  }, [songlistOverride]);

  const openChartFromMeta = useCallback((meta) => {
    if (!meta) return;
    const songId = meta.path || meta.songId || null;
    const chartId = meta.chartSlug || meta.chartId || null;
    if (!songId) return;
    navigate(buildBpmUrl({ pathname: '/bpm', songId, chartId }));
  }, [navigate]);

  const getChartIdentity = useCallback((meta) => {
    if (!meta) return '';
    if (meta.chartId) return String(meta.chartId);
    const songKey = meta.songId || meta.path || meta.title || 'unknown';
    return `${songKey}:${meta.mode || 'unknown'}:${meta.difficulty || 'unknown'}:${meta.level || 'na'}`;
  }, []);

  const scoredChartEntries = useMemo(() => {
    if (!chartMetaLookup || !(chartMetaLookup instanceof Map) || chartMetaLookup.size === 0) {
      return [];
    }

    const modeScores = scores?.[normalizedPlayStyle];
    if (!modeScores || typeof modeScores !== 'object') {
      return [];
    }

    const entries = [];
    for (const [scoreKey, result] of Object.entries(modeScores)) {
      if (!result) continue;
      const trimmedKey = typeof scoreKey === 'string' ? scoreKey.trim() : '';
      if (!trimmedKey) continue;

      const upgradedKey = upgradeChartId(trimmedKey);
      const meta = chartMetaLookup.get(trimmedKey) || (upgradedKey ? chartMetaLookup.get(upgradedKey) : null);
      if (!meta || meta.mode !== normalizedPlayStyle) continue;

      const lamp = typeof result.lamp === 'string' ? result.lamp.toLowerCase() : '';
      if (lamp.includes('no play')) continue;

      entries.push({ meta, result });
    }

    return entries;
  }, [chartMetaLookup, normalizedPlayStyle, scores]);

  const allModeCharts = useMemo(() => {
    if (!chartMetaLookup || !(chartMetaLookup instanceof Map) || chartMetaLookup.size === 0) return [];
    const rows = [];
    const seen = new Set();
    for (const meta of chartMetaLookup.values()) {
      if (!meta || meta.mode !== normalizedPlayStyle) continue;
      const key = getChartIdentity(meta);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(meta);
    }
    return rows;
  }, [chartMetaLookup, getChartIdentity, normalizedPlayStyle]);

  const playedChartKeySet = useMemo(() => {
    const set = new Set();
    for (const entry of scoredChartEntries) {
      const key = getChartIdentity(entry?.meta);
      if (key) set.add(key);
    }
    return set;
  }, [getChartIdentity, scoredChartEntries]);

  const scoredChartStats = useMemo(() => {
    return scoredChartEntries.map(({ meta, result }) => {
      const lamp = String(result?.lamp || '');
      const lampLower = lamp.toLowerCase();
      const score = parseScoreValue(result?.score);
      const level = Number(meta?.level);
      return {
        meta,
        lamp,
        lampLower,
        lampRank: getLampRank(lamp),
        isFailed: lampLower.includes('failed'),
        score,
        level: Number.isFinite(level) ? level : null,
      };
    });
  }, [scoredChartEntries]);

  const scoredChartsWithNumericScore = useMemo(
    () => scoredChartStats.filter((entry) => Number.isFinite(entry.score) && Number.isFinite(entry.level)),
    [scoredChartStats],
  );

  const levelScoreAverages = useMemo(() => {
    const grouped = new Map();
    for (const entry of scoredChartsWithNumericScore) {
      const list = grouped.get(entry.level) || [];
      list.push(entry.score);
      grouped.set(entry.level, list);
    }
    const averages = new Map();
    for (const [level, values] of grouped.entries()) {
      averages.set(level, mean(values));
    }
    return averages;
  }, [scoredChartsWithNumericScore]);

  const levelScoreFloors = useMemo(() => {
    const grouped = new Map();
    for (const entry of scoredChartsWithNumericScore) {
      const list = grouped.get(entry.level) || [];
      list.push(entry.score);
      grouped.set(entry.level, list);
    }
    const floors = new Map();
    for (const [level, values] of grouped.entries()) {
      floors.set(level, percentile(values, 0.25));
    }
    return floors;
  }, [scoredChartsWithNumericScore]);

  const buildBucketRows = useCallback((buckets, valueGetter) => {
    const rows = LEVELS.map((level) => ({
      level,
      buckets: buckets.map((bucket) => ({
        ...bucket,
        count: 0,
        scoreCount: 0,
        scoreTotal: 0,
        avgScore: null,
      })),
      total: 0,
      bestBucketIndex: -1,
    }));

    if (!scoredChartEntries.length) return rows;

    const levelIndex = new Map(LEVELS.map((level, idx) => [level, idx]));
    for (const { meta, result } of scoredChartEntries) {
      const level = Number(meta.level);
      const rowIdx = levelIndex.get(level);
      if (rowIdx == null) continue;

      const metricValue = valueGetter(meta);
      const bucketIdx = pickBucketIndex(metricValue, buckets);
      if (bucketIdx === -1) continue;

      const bucket = rows[rowIdx].buckets[bucketIdx];
      bucket.count += 1;
      rows[rowIdx].total += 1;

      const scoreValue = parseScoreValue(result.score);
      if (scoreValue != null) {
        bucket.scoreCount += 1;
        bucket.scoreTotal += scoreValue;
      }
    }

    for (const row of rows) {
      let bestBucketIndex = -1;
      let bestAverage = -Infinity;
      let bestCount = 0;

      row.buckets.forEach((bucket, idx) => {
        bucket.avgScore = bucket.scoreCount > 0
          ? bucket.scoreTotal / bucket.scoreCount
          : null;

        if (bucket.avgScore == null) return;
        if (bucket.avgScore > bestAverage || (bucket.avgScore === bestAverage && bucket.count > bestCount)) {
          bestAverage = bucket.avgScore;
          bestCount = bucket.count;
          bestBucketIndex = idx;
        }
      });

      row.bestBucketIndex = bestBucketIndex;
    }

    return rows;
  }, [scoredChartEntries]);

  const bpmByLevelRows = useMemo(() => buildBucketRows(BPM_BUCKETS, (meta) => {
    const bpmMin = Number(meta.bpmMin);
    const bpmMax = Number(meta.bpmMax);
    const hasMin = Number.isFinite(bpmMin) && bpmMin > 0;
    const hasMax = Number.isFinite(bpmMax) && bpmMax > 0;
    if (hasMin && hasMax) return (bpmMin + bpmMax) / 2;
    if (hasMax) return bpmMax;
    return hasMin ? bpmMin : NaN;
  }), [buildBucketRows]);

  const crossoverByLevelRows = useMemo(() => buildBucketRows(CROSSOVER_BUCKETS, (meta) => {
    const crossovers = Number(meta.crossovers);
    return Number.isFinite(crossovers) && crossovers >= 0 ? crossovers : NaN;
  }), [buildBucketRows]);

  const npsByLevelRows = useMemo(() => buildBucketRows(NPS_BUCKETS, (meta) => {
    const nps = Number(meta.notesPerSecond);
    return Number.isFinite(nps) && nps >= 0 ? nps : NaN;
  }), [buildBucketRows]);

  const hasBpmMappedScores = useMemo(() => bpmByLevelRows.some((row) => row.total > 0), [bpmByLevelRows]);
  const hasCrossoverMappedScores = useMemo(() => crossoverByLevelRows.some((row) => row.total > 0), [crossoverByLevelRows]);
  const hasNpsMappedScores = useMemo(() => npsByLevelRows.some((row) => row.total > 0), [npsByLevelRows]);
  const bpmDataLoading = hasScores && chartMetaLookup.size === 0;

  const perfectSongRows = useMemo(() => {
    if (!chartMetaLookup || !(chartMetaLookup instanceof Map) || chartMetaLookup.size === 0) {
      return [];
    }

    const playedByChartId = new Map();
    for (const { meta, result } of scoredChartEntries) {
      const key = meta?.chartId;
      if (!key) continue;
      playedByChartId.set(key, result);
    }

    const uniqueCharts = [];
    const seen = new Set();
    for (const meta of chartMetaLookup.values()) {
      if (!meta || meta.mode !== normalizedPlayStyle) continue;
      const key = meta.chartId || `${meta.songId || ''}:${meta.mode}:${meta.difficulty || ''}:${meta.level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueCharts.push(meta);
    }

    return LEVELS.map((level) => {
      const candidates = uniqueCharts.filter((meta) => Number(meta.level) === level);
      if (!candidates.length) {
        return {
          level,
          confidence: 0,
          profile: null,
          bestPlayed: null,
          bestUnplayed: null,
        };
      }

      const playedSamples = candidates
        .map((meta) => {
          const playedResult = meta.chartId ? playedByChartId.get(meta.chartId) : null;
          const score = playedResult ? parseScoreValue(playedResult.score) : null;
          return score != null ? { meta, score } : null;
        })
        .filter(Boolean);

      if (!playedSamples.length) {
        return {
          level,
          confidence: 0,
          profile: null,
          bestPlayed: null,
          bestUnplayed: null,
        };
      }

      playedSamples.sort((a, b) => b.score - a.score);
      const topSampleCount = Math.max(5, Math.ceil(playedSamples.length * 0.35));
      const topSamples = playedSamples.slice(0, topSampleCount);

      const profile = {};
      for (const feature of PERFECT_FEATURES) {
        let weightedSum = 0;
        let weightTotal = 0;
        for (const sample of topSamples) {
          const value = feature.get(sample.meta);
          if (!Number.isFinite(value)) continue;
          const scoreWeight = 0.35 + clamp((sample.score - 800000) / 200000, 0, 1);
          weightedSum += value * scoreWeight;
          weightTotal += scoreWeight;
        }
        profile[feature.key] = weightTotal > 0 ? weightedSum / weightTotal : null;
      }

      const featureCoverage = PERFECT_FEATURES.reduce((count, feature) => (
        Number.isFinite(profile[feature.key]) ? count + 1 : count
      ), 0);
      if (featureCoverage < 4) {
        return {
          level,
          confidence: 0,
          profile,
          bestPlayed: null,
          bestUnplayed: null,
        };
      }

      const topScores = topSamples.map((sample) => sample.score);
      const sampleConfidence = Math.min(1, playedSamples.length / 14);
      const coverageConfidence = featureCoverage / PERFECT_FEATURES.length;
      const stabilityConfidence = 1 - Math.min(1, stdDeviation(topScores) / 70000);
      const confidence = (
        (sampleConfidence * 0.45)
        + (coverageConfidence * 0.35)
        + (stabilityConfidence * 0.2)
      );

      let bestPlayed = null;
      let bestUnplayed = null;
      let bestPlayedFit = -Infinity;
      let bestUnplayedFit = -Infinity;

      for (const meta of candidates) {
        let fitSum = 0;
        let fitWeight = 0;
        let usedFeatures = 0;
        for (const feature of PERFECT_FEATURES) {
          const profileValue = profile[feature.key];
          const candidateValue = feature.get(meta);
          if (!Number.isFinite(profileValue) || !Number.isFinite(candidateValue)) continue;
          const normalizedDiff = Math.abs(candidateValue - profileValue) / feature.scale;
          const similarity = Math.exp(-normalizedDiff);
          fitSum += similarity * feature.weight;
          fitWeight += feature.weight;
          usedFeatures += 1;
        }
        if (usedFeatures < 4 || fitWeight <= 0) continue;
        const fit = fitSum / fitWeight;

        const playedResult = meta.chartId ? playedByChartId.get(meta.chartId) : null;
        const playedScore = playedResult ? parseScoreValue(playedResult.score) : null;
        const payload = { meta, fit, playedScore, usedFeatures };
        if (playedResult) {
          const shouldReplace = !bestPlayed
            || fit > bestPlayedFit
            || (fit === bestPlayedFit && (playedScore ?? -1) > (bestPlayed?.playedScore ?? -1));
          if (shouldReplace) {
            bestPlayed = payload;
            bestPlayedFit = fit;
          }
        } else {
          if (songlistOverrideHasEntries(overrideSongs)) {
            const matchesOverride = songlistOverrideMatches(overrideSongs, {
              title: meta.title,
              titleTranslit: meta.titleTranslit,
              artist: meta.artist,
              artistTranslit: meta.artistTranslit,
              mode: normalizedPlayStyle,
            });
            if (!matchesOverride) continue;
          }
          const shouldReplace = !bestUnplayed
            || fit > bestUnplayedFit;
          if (shouldReplace) {
            bestUnplayed = payload;
            bestUnplayedFit = fit;
          }
        }
      }

      return {
        level,
        confidence,
        profile,
        bestPlayed,
        bestUnplayed,
      };
    });
  }, [
    chartMetaLookup,
    scoredChartEntries,
    normalizedPlayStyle,
    overrideSongs,
  ]);

  const hasPerfectSongData = useMemo(
    () => perfectSongRows.some((row) => row.bestPlayed || row.bestUnplayed),
    [perfectSongRows],
  );

  const struggleFeatureInsights = useMemo(() => {
    const played = scoredChartEntries
      .map(({ meta, result }) => {
        const lamp = String(result?.lamp || '').toLowerCase();
        const score = parseScoreValue(result?.score);
        const fallback = lamp.includes('failed') ? 550000 : 720000;
        return { meta, score: score ?? fallback };
      })
      .filter((entry) => entry?.meta);

    if (played.length < 8) return null;
    played.sort((a, b) => b.score - a.score);
    const sampleSize = Math.max(4, Math.floor(played.length * 0.25));
    const strong = played.slice(0, sampleSize);
    const weak = played.slice(-sampleSize);

    const insights = {};
    for (const feature of PERFECT_FEATURES) {
      const strongVals = strong.map((entry) => feature.get(entry.meta)).filter(Number.isFinite);
      const weakVals = weak.map((entry) => feature.get(entry.meta)).filter(Number.isFinite);
      if (!strongVals.length || !weakVals.length) continue;
      const strongMean = strongVals.reduce((sum, value) => sum + value, 0) / strongVals.length;
      const weakMean = weakVals.reduce((sum, value) => sum + value, 0) / weakVals.length;
      insights[feature.key] = {
        ...feature,
        strongMean,
        weakMean,
        delta: weakMean - strongMean,
      };
    }
    return insights;
  }, [scoredChartEntries]);

  const worstSongsRows = useMemo(() => {
    if (!Array.isArray(scoredChartEntries) || !scoredChartEntries.length) return [];
    if (!struggleFeatureInsights) return [];

    const rows = [];
    for (const { meta, result } of scoredChartEntries) {
      if (songlistOverrideHasEntries(overrideSongs)) {
        const matchesOverride = songlistOverrideMatches(overrideSongs, {
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          mode: normalizedPlayStyle,
        });
        if (!matchesOverride) continue;
      }

      const lamp = String(result?.lamp || '');
      const lampLower = lamp.toLowerCase();
      const numericScore = parseScoreValue(result?.score);
      const scoreForCalc = numericScore ?? (lampLower.includes('failed') ? 550000 : 720000);
      const scorePenalty = clamp((995000 - scoreForCalc) / 260000, 0, 2.2);
      const lampPenalty = lampLower.includes('failed') ? 0.8 : (lampLower.includes('clear') ? 0.15 : 0);

      let featurePenalty = 0;
      const reasons = [];
      for (const feature of PERFECT_FEATURES) {
        const insight = struggleFeatureInsights[feature.key];
        if (!insight) continue;
        const value = feature.get(meta);
        if (!Number.isFinite(value) || !Number.isFinite(insight.strongMean) || !Number.isFinite(insight.weakMean)) continue;

        const closerToWeak = Math.abs(value - insight.strongMean) - Math.abs(value - insight.weakMean);
        const normalized = clamp(closerToWeak / feature.scale, -1.2, 1.2);
        const penalty = Math.max(0, normalized) * feature.weight;
        if (penalty <= 0) continue;
        featurePenalty += penalty;
        reasons.push({
          label: feature.label,
          penalty,
          value,
          weak: insight.weakMean,
          strong: insight.strongMean,
        });
      }

      reasons.sort((a, b) => b.penalty - a.penalty);
      const struggleIndex = (scorePenalty * 1.25) + lampPenalty + featurePenalty;
      rows.push({
        meta,
        lamp: lamp || 'N/A',
        score: numericScore,
        struggleIndex,
        reasons: reasons.slice(0, 3),
      });
    }

    rows.sort((a, b) => {
      if (b.struggleIndex !== a.struggleIndex) return b.struggleIndex - a.struggleIndex;
      const scoreA = Number.isFinite(a.score) ? a.score : -1;
      const scoreB = Number.isFinite(b.score) ? b.score : -1;
      return scoreA - scoreB;
    });
    return rows.slice(0, 60);
  }, [normalizedPlayStyle, overrideSongs, scoredChartEntries, struggleFeatureInsights]);

  const struggleSummary = useMemo(() => {
    if (!worstSongsRows.length) return [];
    const weights = new Map();
    for (const row of worstSongsRows.slice(0, 30)) {
      for (const reason of row.reasons || []) {
        weights.set(reason.label, (weights.get(reason.label) || 0) + reason.penalty);
      }
    }
    return Array.from(weights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([label]) => label);
  }, [worstSongsRows]);

  const nearUpgradeRows = useMemo(() => {
    const rows = [];
    for (const entry of scoredChartsWithNumericScore) {
      const nextGrade = getNextGradeTarget(entry.score);
      const nextLamp = getNextLampTarget(entry.lampRank);
      if (!nextGrade && !nextLamp) continue;

      const pointsToGrade = nextGrade ? Math.max(0, nextGrade.threshold - entry.score) : null;
      const lampSteps = nextLamp ? (nextLamp.rank - entry.lampRank) : 0;
      const urgency = (pointsToGrade ?? 200000) + (lampSteps * 2500);

      rows.push({
        ...entry,
        currentGrade: getGrade(entry.score) || 'N/A',
        nextGrade,
        pointsToGrade,
        nextLamp,
        urgency,
      });
    }

    rows.sort((a, b) => {
      if (a.urgency !== b.urgency) return a.urgency - b.urgency;
      return b.score - a.score;
    });
    return rows.slice(0, 80);
  }, [scoredChartsWithNumericScore]);

  const consistencyByLevelRows = useMemo(() => {
    const grouped = new Map(LEVELS.map((level) => [level, []]));
    for (const entry of scoredChartsWithNumericScore) {
      if (!grouped.has(entry.level)) continue;
      grouped.get(entry.level).push(entry.score);
    }

    return LEVELS.map((level) => {
      const values = grouped.get(level) || [];
      const average = mean(values);
      const minValue = values.length ? Math.min(...values) : null;
      const maxValue = values.length ? Math.max(...values) : null;
      const spread = (minValue != null && maxValue != null) ? (maxValue - minValue) : null;
      return {
        level,
        chartCount: values.length,
        average,
        stdDev: values.length ? stdDeviation(values) : null,
        minValue,
        maxValue,
        spread,
      };
    });
  }, [scoredChartsWithNumericScore]);

  const buildCoverageBucketRows = useCallback((buckets, valueGetter) => {
    const rows = buckets.map((bucket) => ({
      label: bucket.label,
      played: 0,
      total: 0,
      coveragePct: 0,
    }));

    for (const meta of allModeCharts) {
      const value = valueGetter(meta);
      const bucketIdx = pickBucketIndex(value, buckets);
      if (bucketIdx === -1) continue;
      rows[bucketIdx].total += 1;
      const chartKey = getChartIdentity(meta);
      if (chartKey && playedChartKeySet.has(chartKey)) {
        rows[bucketIdx].played += 1;
      }
    }

    for (const row of rows) {
      row.coveragePct = row.total > 0 ? (row.played / row.total) * 100 : 0;
    }

    return rows;
  }, [allModeCharts, getChartIdentity, playedChartKeySet]);

  const coverageByLevelRows = useMemo(() => {
    const rows = LEVELS.map((level) => ({
      level,
      played: 0,
      total: 0,
      coveragePct: 0,
    }));
    const levelIndex = new Map(LEVELS.map((level, idx) => [level, idx]));

    for (const meta of allModeCharts) {
      const level = Number(meta?.level);
      const idx = levelIndex.get(level);
      if (idx == null) continue;
      rows[idx].total += 1;
      const chartKey = getChartIdentity(meta);
      if (chartKey && playedChartKeySet.has(chartKey)) {
        rows[idx].played += 1;
      }
    }

    for (const row of rows) {
      row.coveragePct = row.total > 0 ? (row.played / row.total) * 100 : 0;
    }
    return rows;
  }, [allModeCharts, getChartIdentity, playedChartKeySet]);

  const coverageByBpmBucketRows = useMemo(
    () => buildCoverageBucketRows(BPM_BUCKETS, (meta) => getRepresentativeBpm(meta)),
    [buildCoverageBucketRows],
  );
  const coverageByCrossoverBucketRows = useMemo(
    () => buildCoverageBucketRows(CROSSOVER_BUCKETS, (meta) => Number(meta?.crossovers)),
    [buildCoverageBucketRows],
  );
  const coverageByNpsBucketRows = useMemo(
    () => buildCoverageBucketRows(NPS_BUCKETS, (meta) => Number(meta?.notesPerSecond)),
    [buildCoverageBucketRows],
  );

  const performanceVsLevelRows = useMemo(() => {
    const rows = [];
    for (const entry of scoredChartsWithNumericScore) {
      const baseline = levelScoreAverages.get(entry.level);
      if (!Number.isFinite(baseline)) continue;
      rows.push({
        ...entry,
        baseline,
        delta: entry.score - baseline,
      });
    }
    rows.sort((a, b) => {
      if (b.delta !== a.delta) return b.delta - a.delta;
      return b.score - a.score;
    });
    return rows;
  }, [levelScoreAverages, scoredChartsWithNumericScore]);

  const overperformRows = useMemo(
    () => performanceVsLevelRows.filter((row) => row.delta > 0).slice(0, 35),
    [performanceVsLevelRows],
  );
  const underperformRows = useMemo(
    () => [...performanceVsLevelRows].reverse().filter((row) => row.delta < 0).slice(0, 35),
    [performanceVsLevelRows],
  );

  const skillSignatureRows = useMemo(() => {
    const rows = [];
    for (const signature of SKILL_SIGNATURES) {
      const samples = scoredChartsWithNumericScore
        .map((entry) => {
          const metricValue = signature.get(entry.meta);
          if (!Number.isFinite(metricValue)) return null;
          return { ...entry, metricValue };
        })
        .filter(Boolean);

      if (samples.length < 10) {
        rows.push({
          ...signature,
          sampleCount: samples.length,
          highCount: 0,
          lowCount: 0,
          medianValue: null,
          highAvg: null,
          lowAvg: null,
          delta: null,
          index: null,
        });
        continue;
      }

      const medianValue = percentile(samples.map((sample) => sample.metricValue), 0.5);
      const ordered = [...samples].sort((a, b) => {
        if (a.metricValue !== b.metricValue) return a.metricValue - b.metricValue;
        return a.score - b.score;
      });
      const splitIndex = Math.max(1, Math.floor(ordered.length / 2));
      const low = ordered.slice(0, splitIndex);
      const high = ordered.slice(splitIndex);
      const highAvg = mean(high.map((sample) => sample.score));
      const lowAvg = mean(low.map((sample) => sample.score));
      const delta = (highAvg ?? 0) - (lowAvg ?? 0);
      const index = clamp(50 + (delta / 1200), 0, 100);

      rows.push({
        ...signature,
        sampleCount: samples.length,
        highCount: high.length,
        lowCount: low.length,
        medianValue,
        highAvg,
        lowAvg,
        delta,
        index,
      });
    }
    return rows;
  }, [scoredChartsWithNumericScore]);

  const techPenaltyRows = useMemo(() => {
    const rows = [];
    for (const feature of TECH_PENALTY_FEATURES) {
      const xValues = [];
      const yValues = [];
      for (const entry of scoredChartsWithNumericScore) {
        const baseline = levelScoreAverages.get(entry.level);
        const xValue = Number(entry.meta?.[feature.key]);
        if (!Number.isFinite(baseline) || !Number.isFinite(xValue)) continue;
        xValues.push(xValue);
        yValues.push(entry.score - baseline);
      }

      const correlation = pearsonCorrelation(xValues, yValues);
      if (!Number.isFinite(correlation) || xValues.length < 12) continue;

      rows.push({
        ...feature,
        sampleCount: xValues.length,
        correlation,
        penaltyIndex: correlation < 0 ? Math.abs(correlation) * 100 : 0,
        benefitIndex: correlation > 0 ? correlation * 100 : 0,
      });
    }

    rows.sort((a, b) => {
      if (b.penaltyIndex !== a.penaltyIndex) return b.penaltyIndex - a.penaltyIndex;
      return Math.abs(b.correlation) - Math.abs(a.correlation);
    });
    return rows;
  }, [levelScoreAverages, scoredChartsWithNumericScore]);

  const burstVsStreamRows = useMemo(() => {
    const samples = scoredChartsWithNumericScore
      .map((entry) => {
        const maxNps = safeNumber(entry.meta?.maximumNotesPerSecond, NaN);
        const meanNps = safeNumber(entry.meta?.meanNotesPerSecond, safeNumber(entry.meta?.notesPerSecond, NaN));
        const streamNotes = safeNumber(entry.meta?.streamNotes, NaN);
        if (!Number.isFinite(maxNps) || !Number.isFinite(meanNps) || !Number.isFinite(streamNotes)) return null;
        return {
          ...entry,
          maxNps,
          meanNps,
          streamNotes,
          burstiness: Math.max(0, maxNps - meanNps),
        };
      })
      .filter(Boolean);

    if (samples.length < 12) return [];

    const burstMedian = percentile(samples.map((sample) => sample.burstiness), 0.5);
    const streamMedian = percentile(samples.map((sample) => sample.streamNotes), 0.5);
    const groups = {
      burstHeavy: { label: 'Burst-heavy', count: 0, scoreTotal: 0, failCount: 0 },
      streamHeavy: { label: 'Stream-heavy', count: 0, scoreTotal: 0, failCount: 0 },
      balanced: { label: 'Balanced mix', count: 0, scoreTotal: 0, failCount: 0 },
    };

    for (const sample of samples) {
      const isBurstHeavy = sample.burstiness >= burstMedian && sample.streamNotes < streamMedian;
      const isStreamHeavy = sample.streamNotes >= streamMedian && sample.burstiness < burstMedian;
      const group = isBurstHeavy ? groups.burstHeavy : (isStreamHeavy ? groups.streamHeavy : groups.balanced);
      group.count += 1;
      group.scoreTotal += sample.score;
      if (sample.isFailed) group.failCount += 1;
    }

    return Object.values(groups).map((group) => ({
      ...group,
      averageScore: group.count > 0 ? group.scoreTotal / group.count : null,
      failRate: group.count > 0 ? (group.failCount / group.count) * 100 : 0,
    }));
  }, [scoredChartsWithNumericScore]);

  const crossoverTypeRows = useMemo(() => {
    const groups = {
      half: { label: 'Half crossover dominant', count: 0, scoreTotal: 0, scoreCount: 0, failCount: 0, totalCrossovers: 0 },
      full: { label: 'Full crossover dominant', count: 0, scoreTotal: 0, scoreCount: 0, failCount: 0, totalCrossovers: 0 },
      hold: { label: 'Hold crossover dominant', count: 0, scoreTotal: 0, scoreCount: 0, failCount: 0, totalCrossovers: 0 },
      mixed: { label: 'Mixed crossover profile', count: 0, scoreTotal: 0, scoreCount: 0, failCount: 0, totalCrossovers: 0 },
    };

    for (const entry of scoredChartStats) {
      const half = safeNumber(entry.meta?.halfCrossovers);
      const full = safeNumber(entry.meta?.fullCrossovers);
      const hold = safeNumber(entry.meta?.holdCrossovers);
      const totalCrossovers = half + full + hold;
      if (totalCrossovers <= 0) continue;

      const dominant = Math.max(half, full, hold);
      let bucketKey = 'mixed';
      if (dominant > 0) {
        const dominantCount = [half, full, hold].filter((value) => value === dominant).length;
        if (dominantCount === 1) {
          if (dominant === half) bucketKey = 'half';
          else if (dominant === full) bucketKey = 'full';
          else bucketKey = 'hold';
        }
      }

      const bucket = groups[bucketKey];
      bucket.count += 1;
      bucket.totalCrossovers += totalCrossovers;
      if (Number.isFinite(entry.score)) {
        bucket.scoreTotal += entry.score;
        bucket.scoreCount += 1;
      }
      if (entry.isFailed) bucket.failCount += 1;
    }

    return Object.values(groups)
      .filter((row) => row.count > 0)
      .map((row) => ({
        ...row,
        averageScore: row.scoreCount > 0 ? row.scoreTotal / row.scoreCount : null,
        avgCrossovers: row.count > 0 ? row.totalCrossovers / row.count : null,
        failRate: row.count > 0 ? (row.failCount / row.count) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [scoredChartStats]);

  const executionRiskRows = useMemo(() => {
    const rows = [];
    for (const entry of scoredChartsWithNumericScore) {
      const levelFloor = levelScoreFloors.get(entry.level);
      if (!Number.isFinite(levelFloor)) continue;
      const jacks = safeNumber(entry.meta?.jacks);
      const drills = safeNumber(entry.meta?.drills);
      const stops = safeNumber(entry.meta?.stops);
      const spins360 = safeNumber(entry.meta?.spins360);
      const technicalMoves = safeNumber(entry.meta?.technicalMoves);
      const maxNps = safeNumber(entry.meta?.maximumNotesPerSecond);
      const meanNps = safeNumber(entry.meta?.meanNotesPerSecond, safeNumber(entry.meta?.notesPerSecond));
      const burstGap = Math.max(0, maxNps - meanNps);
      const belowFloor = Math.max(0, (levelFloor - entry.score) / 12000);

      const featureParts = [
        { label: 'Jacks', value: jacks, weight: 1 / 18 },
        { label: 'Drills', value: drills, weight: 1 / 12 },
        { label: 'Stops', value: stops, weight: 1 / 8 },
        { label: 'Spins 360', value: spins360, weight: 0.9 },
        { label: 'Burst Gap', value: burstGap, weight: 1 / 1.4 },
        { label: 'Technical Moves', value: technicalMoves, weight: 1 / 60 },
      ];

      const weightedFeatures = featureParts.map((part) => ({
        ...part,
        contribution: Math.max(0, part.value) * part.weight,
      }));
      const volatilityIndex = weightedFeatures.reduce((sum, part) => sum + part.contribution, 0);
      const riskIndex = (belowFloor * 1.6) + volatilityIndex;
      if (riskIndex < 0.9) continue;

      const reasons = weightedFeatures
        .filter((part) => part.contribution > 0)
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3)
        .map((part) => ({ label: part.label, value: part.value }));

      rows.push({
        ...entry,
        levelFloor,
        riskIndex,
        reasons,
      });
    }

    rows.sort((a, b) => {
      if (b.riskIndex !== a.riskIndex) return b.riskIndex - a.riskIndex;
      return a.score - b.score;
    });
    return rows.slice(0, 60);
  }, [levelScoreFloors, scoredChartsWithNumericScore]);

  const efficientClearRows = useMemo(() => {
    const rows = [];
    for (const entry of scoredChartsWithNumericScore) {
      if (entry.isFailed) continue;
      const complexity = computeComplexityScore(entry.meta);
      if (!Number.isFinite(complexity)) continue;
      const efficiencyIndex = (entry.score / complexity) * 100;
      rows.push({
        ...entry,
        complexity,
        efficiencyIndex,
      });
    }

    rows.sort((a, b) => b.efficiencyIndex - a.efficiencyIndex);
    return rows.slice(0, 60);
  }, [scoredChartsWithNumericScore]);

  const topComplexChartsRows = useMemo(() => {
    if (!Array.isArray(allModeCharts) || !allModeCharts.length) return [];
    const rows = [];
    for (const meta of allModeCharts) {
      if (songlistOverrideHasEntries(overrideSongs)) {
        const matchesOverride = songlistOverrideMatches(overrideSongs, {
          title: meta.title,
          titleTranslit: meta.titleTranslit,
          artist: meta.artist,
          artistTranslit: meta.artistTranslit,
          mode: normalizedPlayStyle,
        });
        if (!matchesOverride) continue;
      }

      const complexity = computeComplexityScore(meta);
      if (!Number.isFinite(complexity)) continue;
      rows.push({
        meta,
        complexity,
        technicalMoves: safeNumber(meta?.technicalMoves),
        notesPerSecond: safeNumber(meta?.notesPerSecond),
        maxNps: safeNumber(meta?.maximumNotesPerSecond),
        crossovers: safeNumber(meta?.crossovers),
        stops: safeNumber(meta?.stops),
        bpmMin: safeNumber(meta?.bpmMin),
        bpmMax: safeNumber(meta?.bpmMax, safeNumber(meta?.bpmMin)),
      });
    }

    rows.sort((a, b) => {
      if (b.complexity !== a.complexity) return b.complexity - a.complexity;
      const levelA = safeNumber(a.meta?.level);
      const levelB = safeNumber(b.meta?.level);
      if (levelB !== levelA) return levelB - levelA;
      return String(a.meta?.title || '').localeCompare(String(b.meta?.title || ''));
    });

    return rows.slice(0, 20);
  }, [allModeCharts, normalizedPlayStyle, overrideSongs]);

  const rankedDifficultyDeltaRows = useMemo(() => {
    const samples = scoredChartsWithNumericScore.filter((entry) => Number.isFinite(Number(entry.meta?.rankedRating)));
    if (!samples.length) return [];

    const bucketScores = new Map();
    for (const entry of samples) {
      const rating = Number(entry.meta.rankedRating);
      const bucketKey = (Math.round(rating * 2) / 2).toFixed(1);
      const list = bucketScores.get(bucketKey) || [];
      list.push(entry.score);
      bucketScores.set(bucketKey, list);
    }

    const bucketAverages = new Map();
    for (const [key, values] of bucketScores.entries()) {
      bucketAverages.set(key, mean(values));
    }

    const rows = samples.map((entry) => {
      const rating = Number(entry.meta.rankedRating);
      const bucketKey = (Math.round(rating * 2) / 2).toFixed(1);
      const bucketAverage = bucketAverages.get(bucketKey);
      return {
        ...entry,
        rating,
        bucketKey,
        bucketAverage,
        delta: Number.isFinite(bucketAverage) ? entry.score - bucketAverage : null,
      };
    }).filter((row) => Number.isFinite(row.delta));

    rows.sort((a, b) => b.delta - a.delta);
    return rows;
  }, [scoredChartsWithNumericScore]);

  const rankedDeltaOverRows = useMemo(
    () => rankedDifficultyDeltaRows.filter((row) => row.delta > 0).slice(0, 30),
    [rankedDifficultyDeltaRows],
  );
  const rankedDeltaUnderRows = useMemo(
    () => [...rankedDifficultyDeltaRows].reverse().filter((row) => row.delta < 0).slice(0, 30),
    [rankedDifficultyDeltaRows],
  );

  const techniqueImbalanceRows = useMemo(() => {
    if (!scoredChartStats.length) return [];
    const totals = scoredChartStats.reduce((acc, entry) => ({
      footswitches: acc.footswitches + safeNumber(entry.meta?.footswitches),
      doublesteps: acc.doublesteps + safeNumber(entry.meta?.doublesteps),
      crossovers: acc.crossovers + safeNumber(entry.meta?.crossovers),
      steps: acc.steps + safeNumber(entry.meta?.steps),
      jumps: acc.jumps + safeNumber(entry.meta?.jumps),
      holds: acc.holds + safeNumber(entry.meta?.holds),
      maxNps: acc.maxNps + safeNumber(entry.meta?.maximumNotesPerSecond, safeNumber(entry.meta?.notesPerSecond)),
      meanNps: acc.meanNps + safeNumber(entry.meta?.meanNotesPerSecond, safeNumber(entry.meta?.notesPerSecond)),
      upFootswitches: acc.upFootswitches + safeNumber(entry.meta?.upFootswitches),
      downFootswitches: acc.downFootswitches + safeNumber(entry.meta?.downFootswitches),
      count: acc.count + 1,
    }), {
      footswitches: 0,
      doublesteps: 0,
      crossovers: 0,
      steps: 0,
      jumps: 0,
      holds: 0,
      maxNps: 0,
      meanNps: 0,
      upFootswitches: 0,
      downFootswitches: 0,
      count: 0,
    });

    const makeRow = (label, value, minTarget, maxTarget, invert = false) => {
      let status = 'Balanced';
      if (!Number.isFinite(value)) {
        status = 'N/A';
      } else if (!invert && value < minTarget) {
        status = 'Low';
      } else if (!invert && value > maxTarget) {
        status = 'High';
      } else if (invert && (value < minTarget || value > maxTarget)) {
        status = 'Skewed';
      }
      return { label, value, target: `${minTarget.toFixed(2)}-${maxTarget.toFixed(2)}`, status };
    };

    const avgMaxNps = totals.count > 0 ? totals.maxNps / totals.count : null;
    const avgMeanNps = totals.count > 0 ? totals.meanNps / totals.count : null;
    const crossoverDensity = totals.steps > 0 ? (totals.crossovers / totals.steps) * 100 : null;

    return [
      makeRow('Footswitch vs Doublestep ratio', totals.footswitches / Math.max(1, totals.doublesteps), 0.9, 2.6),
      makeRow('Crossover density (% of steps)', crossoverDensity, 2.0, 12.0),
      makeRow('Jump vs Hold ratio', totals.jumps / Math.max(1, totals.holds), 0.6, 1.8),
      makeRow('Burst/Stream ratio (avg maxNPS / avg meanNPS)', avgMaxNps / Math.max(0.01, avgMeanNps), 1.1, 1.9),
      makeRow('Up vs Down footswitch ratio', totals.upFootswitches / Math.max(1, totals.downFootswitches), 0.8, 1.25, true),
    ];
  }, [scoredChartStats]);

  const chartColors = useMemo(() => {
    const tooltipFallback = theme === 'light'
      ? 'rgba(255, 255, 255, 0.94)'
      : DEFAULT_CHART_COLORS.tooltipBg;
    const tooltipTextFallback = theme === 'light'
      ? '#1F2937'
      : DEFAULT_CHART_COLORS.tooltipText;

    return {
      mfc: readCssVariable('--pink-color', DEFAULT_CHART_COLORS.mfc),
      pfc: readCssVariable('--yellow-color', DEFAULT_CHART_COLORS.pfc),
      aaa: readCssVariable('--blue-color', DEFAULT_CHART_COLORS.aaa),
      other: readCssVariable('--green-color', DEFAULT_CHART_COLORS.other),
      fail: readCssVariable('--button-down-color', DEFAULT_CHART_COLORS.fail),
      axis: readCssVariable('--text-muted-color', DEFAULT_CHART_COLORS.axis),
      grid: readCssVariable('--border-color', DEFAULT_CHART_COLORS.grid),
      tooltipBg: readCssVariable('--bg-color-dark', tooltipFallback),
      tooltipText: readCssVariable('--text-color', tooltipTextFallback),
    };
  }, [theme]);

  const chartData = useMemo(() => {
    const datasets = [
      { key: 'mfc', label: 'MFC', color: chartColors.mfc },
      { key: 'pfc', label: 'PFC', color: chartColors.pfc },
      { key: 'aaa', label: 'AAA (≥990k)', color: chartColors.aaa },
      ...(hasOther ? [{ key: 'other', label: 'Other Clears', color: chartColors.other }] : []),
      { key: 'fail', label: 'Fails', color: chartColors.fail },
    ];

    return {
      labels: LEVELS.map(level => `Lv.${level}`),
      datasets: datasets.map((ds, index) => ({
        label: ds.label,
        data: levelSummaries.map(entry => entry[ds.key] || 0),
        backgroundColor: ds.color,
        stack: 'counts',
        borderRadius: ctx => {
          const chartDatasets = ctx?.chart?.data?.datasets || [];
          const value = Number(chartDatasets[index]?.data?.[ctx.dataIndex] || 0);
          if (!Number.isFinite(value) || value <= 0) return 0;
          const hasHigherValue = chartDatasets
            .slice(index + 1)
            .some(dataset => {
              const nextValue = Number(dataset?.data?.[ctx.dataIndex] || 0);
              return Number.isFinite(nextValue) && nextValue > 0;
            });
          if (hasHigherValue) return 0;
          return { topLeft: 8, topRight: 8, bottomLeft: 0, bottomRight: 0 };
        },
        borderSkipped: false,
        barPercentage: 0.9,
        categoryPercentage: 0.9,
      })),
    };
  }, [levelSummaries, hasOther, chartColors]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: chartColors.axis,
          usePointStyle: true,
          pointStyle: 'rectRounded',
          padding: 16,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: chartColors.tooltipBg,
        titleColor: chartColors.tooltipText,
        bodyColor: chartColors.tooltipText,
        borderColor: chartColors.grid,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: chartColors.grid },
        ticks: {
          color: chartColors.axis,
          maxRotation: 0,
          font: { size: 12, family: 'Manrope, Segoe UI, sans-serif' },
        },
      },
      y: {
        stacked: true,
        grid: { color: chartColors.grid },
        ticks: {
          color: chartColors.axis,
          beginAtZero: true,
          precision: 0,
          stepSize: 1,
          font: { size: 12, family: 'Manrope, Segoe UI, sans-serif' },
        },
      },
    },
  }), [chartColors]);

  const playStyleLabel = playStyle === 'double' ? 'Double (DP)' : 'Single (SP)';
  const awaitingInitialStats = !statsReady && !hasScores;

  if (!user) {
    return (
      <div className="app-container">
        <main className="stats-page">
          <section className="stats-card">
            <div className="stats-empty">Log in to view your stats.</div>
          </section>
        </main>
      </div>
    );
  }

  if (statsReady && !hasUploadedScores) {
    return (
      <div className="app-container">
        <main className="stats-page">
          <section className="stats-card">
            <div className="stats-empty">Upload your scores from Settings to unlock stats.</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <main className="stats-page">
        <section className="filter-bar stats-filter-bar">
          <div className="filter-group stats-filter-group">
            <label htmlFor="stats-view-select" className="target-bpm-label stats-filter-title">Stats View</label>
            <div className="dan-select-wrapper stats-filter-selector">
              <select
                id="stats-view-select"
                className="dan-select"
                value={selectedStatView}
                onChange={(event) => setSelectedStatView(event.target.value)}
              >
                <option value="resultsByLevel">Results by Level (Raw Breakdown included)</option>
                <option value="bpmByLevel">BPM Ranges by Level</option>
                <option value="crossoversByLevel">Amount of Crossovers by Level</option>
                <option value="npsByLevel">Notes/Second by Level</option>
                <option value="perfectSongByLevel">Perfect Song by Level</option>
                <option value="worstSongs">Worst Songs (Your Struggle List)</option>
                <option value="nearUpgrades">Near-Upgrade Opportunities</option>
                <option value="consistencyByLevel">Consistency by Level</option>
                <option value="coverageGapHeatmap">Coverage Gap Heatmap</option>
                <option value="overUnderperform">Overperform / Underperform</option>
                <option value="skillSignature">Skill Signature</option>
                <option value="techPenalty">Tech Penalty Index</option>
                <option value="burstVsStream">Burst vs Stream Split</option>
                <option value="crossoverTypeSplit">Crossover Type Split</option>
                <option value="executionRisk">Execution Risk List</option>
                <option value="topComplexCharts">Most Complex Charts (Top 20)</option>
                <option value="efficientClears">Most Efficient Clears</option>
                <option value="rankedDelta">Ranked Difficulty Delta</option>
                <option value="techniqueImbalance">Technique Imbalance</option>
              </select>
            </div>
          </div>
        </section>

        {selectedStatView === 'resultsByLevel' ? (
          <>
            <section className="stats-card">
              <div className="stats-card-header">
                <h2>Results by Level</h2>
              </div>
              <p className="stats-subtitle">Stacked bars show how many charts you&apos;ve logged per level, split by result.</p>

              {awaitingInitialStats ? (
                <div className="stats-empty">Loading stats…</div>
              ) : hasScores ? (
                <div className="stats-chart-wrapper">
                  <Bar data={chartData} options={chartOptions} />
                </div>
              ) : (
                <div className="stats-empty">Log some {playStyleLabel} scores to see your progress.</div>
              )}
            </section>

            <section className="stats-card">
              <div className="stats-card-header">
                <h2>Raw Breakdown</h2>
                <span className="stats-summary">Total charts played: {totals.played}</span>
              </div>
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Played</th>
                      <th scope="col">MFC</th>
                      <th scope="col">PFC</th>
                      <th scope="col">AAA</th>
                      {hasOther && <th scope="col">Other Clears</th>}
                      <th scope="col">Fails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levelSummaries.map(entry => (
                      <tr key={entry.level}>
                        <th scope="row">Lv.{entry.level}</th>
                        <td className="numeric">{entry.total}</td>
                        <td className="numeric">{entry.mfc}</td>
                        <td className="numeric">{entry.pfc}</td>
                        <td className="numeric">{entry.aaa}</td>
                        {hasOther && <td className="numeric">{entry.other}</td>}
                        <td className="numeric">{entry.fail}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total</th>
                      <td className="numeric">{totals.played}</td>
                      <td className="numeric">{totals.mfc}</td>
                      <td className="numeric">{totals.pfc}</td>
                      <td className="numeric">{totals.aaa}</td>
                      {hasOther && <td className="numeric">{totals.other}</td>}
                      <td className="numeric">{totals.fail}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        ) : selectedStatView === 'bpmByLevel' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>BPM Ranges by Level</h2>
              <span className="stats-summary">Best average score per level is highlighted</span>
            </div>
            <p className="stats-subtitle">Each chart is grouped by its representative BPM and level. Use this to spot your strongest tempo windows.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading BPM mapping…</div>
            ) : hasBpmMappedScores ? (
              <div className="stats-table-wrapper">
                <table className="stats-table stats-bpm-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      {BPM_BUCKETS.map((bucket) => (
                        <th scope="col" key={bucket.label}>{bucket.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bpmByLevelRows.map((row) => (
                      <tr key={row.level}>
                        <th scope="row">Lv.{row.level}</th>
                        {row.buckets.map((bucket, idx) => {
                          const isBest = idx === row.bestBucketIndex && bucket.avgScore != null;
                          return (
                            <td key={`${row.level}-${bucket.label}`} className={isBest ? 'stats-bpm-best' : ''}>
                              {bucket.count > 0 ? (
                                <div className="stats-bpm-cell">
                                  <span><span className="stats-number">{bucket.count}</span> chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? <><span className="stats-number">{Math.round(bucket.avgScore).toLocaleString()}</span> avg</> : 'No score'}</span>
                                </div>
                              ) : (
                                <span className="stats-bpm-empty">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No BPM-linked charts found yet for your {playStyleLabel} scores.</div>
            )}
          </section>
        ) : selectedStatView === 'crossoversByLevel' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Amount of Crossovers by Level</h2>
              <span className="stats-summary">Best average score per level is highlighted</span>
            </div>
            <p className="stats-subtitle">Each chart is grouped by crossover count and level so you can spot where your crossover comfort zone is strongest.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading crossover mapping…</div>
            ) : hasCrossoverMappedScores ? (
              <div className="stats-table-wrapper">
                <table className="stats-table stats-bpm-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      {CROSSOVER_BUCKETS.map((bucket) => (
                        <th scope="col" key={bucket.label}>{bucket.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {crossoverByLevelRows.map((row) => (
                      <tr key={row.level}>
                        <th scope="row">Lv.{row.level}</th>
                        {row.buckets.map((bucket, idx) => {
                          const isBest = idx === row.bestBucketIndex && bucket.avgScore != null;
                          return (
                            <td key={`${row.level}-${bucket.label}`} className={isBest ? 'stats-bpm-best' : ''}>
                              {bucket.count > 0 ? (
                                <div className="stats-bpm-cell">
                                  <span><span className="stats-number">{bucket.count}</span> chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? <><span className="stats-number">{Math.round(bucket.avgScore).toLocaleString()}</span> avg</> : 'No score'}</span>
                                </div>
                              ) : (
                                <span className="stats-bpm-empty">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No crossover-linked charts found yet for your {playStyleLabel} scores.</div>
            )}
          </section>
        ) : selectedStatView === 'npsByLevel' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Notes/Second by Level</h2>
              <span className="stats-summary">Best average score per level is highlighted</span>
            </div>
            <p className="stats-subtitle">Each chart is grouped by notes per second and level so you can spot your strongest note-density ranges.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading notes/second mapping…</div>
            ) : hasNpsMappedScores ? (
              <div className="stats-table-wrapper">
                <table className="stats-table stats-bpm-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      {NPS_BUCKETS.map((bucket) => (
                        <th scope="col" key={bucket.label}>{bucket.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {npsByLevelRows.map((row) => (
                      <tr key={row.level}>
                        <th scope="row">Lv.{row.level}</th>
                        {row.buckets.map((bucket, idx) => {
                          const isBest = idx === row.bestBucketIndex && bucket.avgScore != null;
                          return (
                            <td key={`${row.level}-${bucket.label}`} className={isBest ? 'stats-bpm-best' : ''}>
                              {bucket.count > 0 ? (
                                <div className="stats-bpm-cell">
                                  <span><span className="stats-number">{bucket.count}</span> chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? <><span className="stats-number">{Math.round(bucket.avgScore).toLocaleString()}</span> avg</> : 'No score'}</span>
                                </div>
                              ) : (
                                <span className="stats-bpm-empty">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No notes/second-linked charts found yet for your {playStyleLabel} scores.</div>
            )}
          </section>
        ) : selectedStatView === 'perfectSongByLevel' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Perfect Song by Level</h2>
              <span className="stats-summary">Includes best unplayed match</span>
            </div>
            <p className="stats-subtitle">Per level, ideal buckets are built from your strongest averages (BPM, crossovers, notes/sec), then matched to the closest chart.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading perfect-song mapping…</div>
            ) : hasPerfectSongData ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Confidence</th>
                      <th scope="col">Target Profile</th>
                      <th scope="col">Best Played</th>
                      <th scope="col">Best Unplayed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfectSongRows.map((row) => {
                      const profile = row.profile || {};
                      const renderChartCell = (entry) => {
                        if (!entry?.meta) return <span className="stats-bpm-empty">-</span>;
                        const displayTitle = showTransliterationBeta
                          ? (entry.meta.titleTranslit || entry.meta.title)
                          : entry.meta.title;
                        const difficulty = entry.meta.difficulty ? entry.meta.difficulty.toUpperCase() : 'N/A';
                        const bpmValue = getRepresentativeBpm(entry.meta);
                        const xoValue = Number(entry.meta.crossovers);
                        const npsValue = Number(entry.meta.notesPerSecond);
                        const jumpsValue = Number(entry.meta.jumps);
                        const streamNotesValue = Number(entry.meta.streamNotes);
                        const scoreText = Number.isFinite(entry.playedScore)
                          ? ` | Score ${Math.round(entry.playedScore).toLocaleString()}`
                          : '';
                        return (
                          <div className="stats-bpm-cell stats-perfect-cell">
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(entry.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                            <span>
                              BPM <span className="stats-number">{Number.isFinite(bpmValue) ? Math.round(bpmValue) : 'N/A'}</span> | XO <span className="stats-number">{Number.isFinite(xoValue) ? xoValue : 'N/A'}</span> | NPS <span className="stats-number">{formatMetricValue(npsValue)}</span> | Jumps <span className="stats-number">{Number.isFinite(jumpsValue) ? jumpsValue : 'N/A'}</span> | Stream <span className="stats-number">{Number.isFinite(streamNotesValue) ? streamNotesValue : 'N/A'}</span> | Fit <span className="stats-number">{entry.fit.toFixed(2)}</span> (<span className="stats-number">{entry.usedFeatures}</span>/8){scoreText}
                            </span>
                          </div>
                        );
                      };

                      return (
                        <tr key={row.level}>
                          <th scope="row">Lv.{row.level}</th>
                          <td><span className="stats-number">{Math.round((row.confidence || 0) * 100)}%</span></td>
                          <td>
                            <div className="stats-bpm-cell stats-perfect-cell">
                              <span>
                                BPM <span className="stats-number">{formatMetricValue(profile.bpm, 0)}</span> | XO <span className="stats-number">{formatMetricValue(profile.crossovers, 0)}</span> | NPS <span className="stats-number">{formatMetricValue(profile.notesPerSecond, 2)}</span>
                              </span>
                              <span>
                                Jumps <span className="stats-number">{formatMetricValue(profile.jumps, 0)}</span> | Holds <span className="stats-number">{formatMetricValue(profile.holds, 0)}</span> | Footswitches <span className="stats-number">{formatMetricValue(profile.footswitches, 0)}</span> | Doublesteps <span className="stats-number">{formatMetricValue(profile.doublesteps, 0)}</span> | Stream <span className="stats-number">{formatMetricValue(profile.streamNotes, 0)}</span>
                              </span>
                            </div>
                          </td>
                          <td>{renderChartCell(row.bestPlayed)}</td>
                          <td>{renderChartCell(row.bestUnplayed)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough scored charts yet to infer perfect-song profiles.</div>
            )}
          </section>
        ) : selectedStatView === 'worstSongs' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Worst Songs</h2>
              <span className="stats-summary">Ranked by struggle index</span>
            </div>
            <p className="stats-subtitle">
              Uses score, lamp, and chart traits that align with your weaker patterns to find songs you currently struggle with most.
              {struggleSummary.length > 0 ? ` Common struggle traits: ${struggleSummary.join(', ')}.` : ''}
            </p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading struggle analysis…</div>
            ) : worstSongsRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Song</th>
                      <th scope="col">Score</th>
                      <th scope="col">Lamp</th>
                      <th scope="col">Struggle</th>
                      <th scope="col">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstSongsRows.map((row) => {
                      const displayTitle = showTransliterationBeta
                        ? (row.meta.titleTranslit || row.meta.title)
                        : row.meta.title;
                      const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                      return (
                        <tr key={`${row.meta.chartId || row.meta.path || row.meta.title}-${difficulty}`}>
                          <td className="numeric"><span className="stats-number">{row.meta.level}</span></td>
                          <td>
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(row.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                          </td>
                          <td className="numeric">
                            {Number.isFinite(row.score)
                              ? <span className="stats-number">{Math.round(row.score).toLocaleString()}</span>
                              : 'N/A'}
                          </td>
                          <td>{row.lamp || 'N/A'}</td>
                          <td className="numeric"><span className="stats-number">{row.struggleIndex.toFixed(2)}</span></td>
                          <td>
                            <div className="stats-bpm-cell stats-perfect-cell">
                              {(row.reasons || []).length > 0 ? row.reasons.map((reason) => (
                                <span key={`${row.meta.chartId || row.meta.path}-${reason.label}`}>
                                  {reason.label} <span className="stats-number">{formatMetricValue(reason.value, reason.label === 'NPS' ? 2 : 0)}</span>
                                </span>
                              )) : <span className="stats-bpm-empty">Low score/lamp pressure</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough scored charts yet to build your struggle list.</div>
            )}
          </section>
        ) : selectedStatView === 'nearUpgrades' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Near-Upgrade Opportunities</h2>
              <span className="stats-summary">Closest steps to your next grade or lamp</span>
            </div>
            <p className="stats-subtitle">Sorted by smallest upgrade gap so you can pick quick wins.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading upgrade opportunities…</div>
            ) : nearUpgradeRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Song</th>
                      <th scope="col">Score</th>
                      <th scope="col">Grade</th>
                      <th scope="col">Next Grade</th>
                      <th scope="col">To Grade</th>
                      <th scope="col">Lamp</th>
                      <th scope="col">Next Lamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearUpgradeRows.map((row) => {
                      const displayTitle = showTransliterationBeta
                        ? (row.meta.titleTranslit || row.meta.title)
                        : row.meta.title;
                      const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                      return (
                        <tr key={`${getChartIdentity(row.meta)}-near`}>
                          <td className="numeric">{row.level}</td>
                          <td>
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(row.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                          </td>
                          <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                          <td>{row.currentGrade}</td>
                          <td>{row.nextGrade ? `${row.nextGrade.grade} (${row.nextGrade.threshold.toLocaleString()})` : '-'}</td>
                          <td className="numeric">{row.pointsToGrade != null ? row.pointsToGrade.toLocaleString() : '-'}</td>
                          <td>{getLampLabel(row.lampRank)}</td>
                          <td>{row.nextLamp ? row.nextLamp.label : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No near-upgrade rows yet. Add more scores to get targeted goals.</div>
            )}
          </section>
        ) : selectedStatView === 'consistencyByLevel' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Consistency by Level</h2>
              <span className="stats-summary">Average, variance, and spread per level</span>
            </div>
            <p className="stats-subtitle">Find which levels are stable for you and which still swing run-to-run.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading consistency model…</div>
            ) : consistencyByLevelRows.some((row) => row.chartCount > 0) ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Charts</th>
                      <th scope="col">Average</th>
                      <th scope="col">Std Dev</th>
                      <th scope="col">Best</th>
                      <th scope="col">Worst</th>
                      <th scope="col">Spread</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consistencyByLevelRows.map((row) => (
                      <tr key={`consistency-${row.level}`}>
                        <td className="numeric">{row.level}</td>
                        <td className="numeric">{row.chartCount}</td>
                        <td className="numeric">{Number.isFinite(row.average) ? Math.round(row.average).toLocaleString() : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.stdDev) ? Math.round(row.stdDev).toLocaleString() : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.maxValue) ? Math.round(row.maxValue).toLocaleString() : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.minValue) ? Math.round(row.minValue).toLocaleString() : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.spread) ? Math.round(row.spread).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough numeric scores yet to estimate consistency.</div>
            )}
          </section>
        ) : selectedStatView === 'coverageGapHeatmap' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Coverage Gap Heatmap</h2>
              <span className="stats-summary">Played vs total charts by level and trait buckets</span>
            </div>
            <p className="stats-subtitle">Low-coverage zones are your easiest expansion targets.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading coverage map…</div>
            ) : allModeCharts.length > 0 ? (
              <>
                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Level</th>
                        <th scope="col">Played</th>
                        <th scope="col">Total</th>
                        <th scope="col">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageByLevelRows.map((row) => (
                        <tr key={`coverage-level-${row.level}`}>
                          <td className="numeric">{row.level}</td>
                          <td className="numeric">{row.played}</td>
                          <td className="numeric">{row.total}</td>
                          <td className={getCoverageClassName(row.coveragePct)}>
                            <span className="stats-number">{Math.round(row.coveragePct)}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Bucket Type</th>
                        <th scope="col">Bucket</th>
                        <th scope="col">Played</th>
                        <th scope="col">Total</th>
                        <th scope="col">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'BPM', rows: coverageByBpmBucketRows },
                        { key: 'Crossovers', rows: coverageByCrossoverBucketRows },
                        { key: 'NPS', rows: coverageByNpsBucketRows },
                      ].flatMap((group) => group.rows.map((row) => ({ ...row, group: group.key }))).map((row) => (
                        <tr key={`${row.group}-${row.label}`}>
                          <td>{row.group}</td>
                          <td>{row.label}</td>
                          <td className="numeric">{row.played}</td>
                          <td className="numeric">{row.total}</td>
                          <td className={getCoverageClassName(row.coveragePct)}>
                            <span className="stats-number">{Math.round(row.coveragePct)}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="stats-empty">No chart metadata available for coverage analysis.</div>
            )}
          </section>
        ) : selectedStatView === 'overUnderperform' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Overperform / Underperform</h2>
              <span className="stats-summary">Compared against your level baseline</span>
            </div>
            <p className="stats-subtitle">Positive values mean you outperform your own average at that level.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading performance deltas…</div>
            ) : performanceVsLevelRows.length > 0 ? (
              <>
                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Top Overperformers</th>
                        <th scope="col">Level</th>
                        <th scope="col">Score</th>
                        <th scope="col">Baseline</th>
                        <th scope="col">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overperformRows.map((row) => {
                        const displayTitle = showTransliterationBeta
                          ? (row.meta.titleTranslit || row.meta.title)
                          : row.meta.title;
                        const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                        return (
                          <tr key={`${getChartIdentity(row.meta)}-over`}>
                            <td>
                              <button
                                type="button"
                                className="stats-song-link"
                                onClick={() => openChartFromMeta(row.meta)}
                                title="Open chart in BPM page"
                              >
                                {displayTitle} ({difficulty})
                              </button>
                            </td>
                            <td className="numeric">{row.level}</td>
                            <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                            <td className="numeric">{Math.round(row.baseline).toLocaleString()}</td>
                            <td className="numeric stats-positive">{formatSigned(row.delta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Top Underperformers</th>
                        <th scope="col">Level</th>
                        <th scope="col">Score</th>
                        <th scope="col">Baseline</th>
                        <th scope="col">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {underperformRows.map((row) => {
                        const displayTitle = showTransliterationBeta
                          ? (row.meta.titleTranslit || row.meta.title)
                          : row.meta.title;
                        const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                        return (
                          <tr key={`${getChartIdentity(row.meta)}-under`}>
                            <td>
                              <button
                                type="button"
                                className="stats-song-link"
                                onClick={() => openChartFromMeta(row.meta)}
                                title="Open chart in BPM page"
                              >
                                {displayTitle} ({difficulty})
                              </button>
                            </td>
                            <td className="numeric">{row.level}</td>
                            <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                            <td className="numeric">{Math.round(row.baseline).toLocaleString()}</td>
                            <td className="numeric stats-negative">{formatSigned(row.delta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="stats-empty">Not enough scored charts to calculate baseline deltas.</div>
            )}
          </section>
        ) : selectedStatView === 'skillSignature' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Skill Signature</h2>
              <span className="stats-summary">50 is neutral, above 50 is a relative strength</span>
            </div>
            <p className="stats-subtitle">Compares your high-demand vs low-demand performance per skill family.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading skill signature…</div>
            ) : skillSignatureRows.some((row) => row.index != null) ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Skill</th>
                      <th scope="col">Sample</th>
                      <th scope="col">High-Half Avg</th>
                      <th scope="col">Low-Half Avg</th>
                      <th scope="col">Delta</th>
                      <th scope="col">Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skillSignatureRows.map((row) => (
                      <tr key={`signature-${row.key}`}>
                        <td>{row.label}</td>
                        <td className="numeric">{row.sampleCount}</td>
                        <td className="numeric">{Number.isFinite(row.highAvg) ? Math.round(row.highAvg).toLocaleString() : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.lowAvg) ? Math.round(row.lowAvg).toLocaleString() : '-'}</td>
                        <td className={`numeric ${row.delta >= 0 ? 'stats-positive' : 'stats-negative'}`}>
                          {Number.isFinite(row.delta) ? formatSigned(row.delta) : '-'}
                        </td>
                        <td>
                          {Number.isFinite(row.index) ? (
                            <div className="stats-skill-meter">
                              <div className="stats-skill-track">
                                <div
                                  className={`stats-skill-fill ${row.index >= 50 ? 'stats-skill-positive' : 'stats-skill-negative'}`}
                                  style={{ width: `${Math.max(0, Math.min(100, row.index))}%` }}
                                />
                              </div>
                              <span className="stats-number">{Math.round(row.index)}</span>
                            </div>
                          ) : (
                            <span className="stats-bpm-empty">Insufficient data</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough chart variety yet to infer a skill signature.</div>
            )}
          </section>
        ) : selectedStatView === 'techPenalty' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Tech Penalty Index</h2>
              <span className="stats-summary">Negative correlation means that trait tends to cost score</span>
            </div>
            <p className="stats-subtitle">Calculated against score residuals within your own level baselines.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading trait correlations…</div>
            ) : techPenaltyRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Trait</th>
                      <th scope="col">Samples</th>
                      <th scope="col">Correlation</th>
                      <th scope="col">Penalty</th>
                      <th scope="col">Interpretation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techPenaltyRows.map((row) => (
                      <tr key={`penalty-${row.key}`}>
                        <td>{row.label}</td>
                        <td className="numeric">{row.sampleCount}</td>
                        <td className={`numeric ${row.correlation < 0 ? 'stats-negative' : 'stats-positive'}`}>{row.correlation.toFixed(3)}</td>
                        <td className="numeric">{row.penaltyIndex.toFixed(1)}</td>
                        <td>{row.correlation < 0 ? 'Likely weakness' : 'Likely strength'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough data for stable per-trait correlation estimates.</div>
            )}
          </section>
        ) : selectedStatView === 'burstVsStream' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Burst vs Stream Split</h2>
              <span className="stats-summary">How your score profile changes by density type</span>
            </div>
            <p className="stats-subtitle">Burst-heavy charts emphasize spikes; stream-heavy charts emphasize sustain.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading density split…</div>
            ) : burstVsStreamRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Group</th>
                      <th scope="col">Charts</th>
                      <th scope="col">Average Score</th>
                      <th scope="col">Fail Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {burstVsStreamRows.map((row) => (
                      <tr key={`burst-stream-${row.label}`}>
                        <td>{row.label}</td>
                        <td className="numeric">{row.count}</td>
                        <td className="numeric">{Number.isFinite(row.averageScore) ? Math.round(row.averageScore).toLocaleString() : '-'}</td>
                        <td className="numeric">{Math.round(row.failRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough max/mean NPS data to split burst vs stream yet.</div>
            )}
          </section>
        ) : selectedStatView === 'crossoverTypeSplit' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Crossover Type Split</h2>
              <span className="stats-summary">Half, full, and hold crossover behavior</span>
            </div>
            <p className="stats-subtitle">Separates crossover styles to surface where movement type affects outcomes.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading crossover type analysis…</div>
            ) : crossoverTypeRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Profile</th>
                      <th scope="col">Charts</th>
                      <th scope="col">Avg Crossover Count</th>
                      <th scope="col">Average Score</th>
                      <th scope="col">Fail Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossoverTypeRows.map((row) => (
                      <tr key={`xo-type-${row.label}`}>
                        <td>{row.label}</td>
                        <td className="numeric">{row.count}</td>
                        <td className="numeric">{Number.isFinite(row.avgCrossovers) ? row.avgCrossovers.toFixed(1) : '-'}</td>
                        <td className="numeric">{Number.isFinite(row.averageScore) ? Math.round(row.averageScore).toLocaleString() : '-'}</td>
                        <td className="numeric">{Math.round(row.failRate)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No crossover-type metadata found in your played set yet.</div>
            )}
          </section>
        ) : selectedStatView === 'executionRisk' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Execution Risk List</h2>
              <span className="stats-summary">High-volatility charts below your level floor</span>
            </div>
            <p className="stats-subtitle">Highlights charts with high technical volatility where your score is currently lagging.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading execution risk model…</div>
            ) : executionRiskRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Song</th>
                      <th scope="col">Score</th>
                      <th scope="col">Level Floor</th>
                      <th scope="col">Risk</th>
                      <th scope="col">Top Risk Traits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executionRiskRows.map((row) => {
                      const displayTitle = showTransliterationBeta
                        ? (row.meta.titleTranslit || row.meta.title)
                        : row.meta.title;
                      const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                      return (
                        <tr key={`${getChartIdentity(row.meta)}-risk`}>
                          <td className="numeric">{row.level}</td>
                          <td>
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(row.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                          </td>
                          <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                          <td className="numeric">{Math.round(row.levelFloor).toLocaleString()}</td>
                          <td className="numeric">{row.riskIndex.toFixed(2)}</td>
                          <td>
                            <div className="stats-bpm-cell stats-perfect-cell">
                              {row.reasons.map((reason) => (
                                <span key={`${getChartIdentity(row.meta)}-risk-${reason.label}`}>
                                  {reason.label} <span className="stats-number">{formatMetricValue(reason.value, reason.label === 'Burst Gap' ? 2 : 0)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No execution-risk outliers detected from current scores.</div>
            )}
          </section>
        ) : selectedStatView === 'topComplexCharts' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Top 20 Most Complex Charts</h2>
              <span className="stats-summary">Ranked by technical complexity index</span>
            </div>
            <p className="stats-subtitle">Complexity blends technical moves, density, BPM volatility/range, stop count, and ranked difficulty.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading chart complexity ranking…</div>
            ) : topComplexChartsRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Level</th>
                      <th scope="col">Song</th>
                      <th scope="col">Complexity</th>
                      <th scope="col">BPM Range</th>
                      <th scope="col">Stops</th>
                      <th scope="col">Tech Moves</th>
                      <th scope="col">NPS</th>
                      <th scope="col">Max NPS</th>
                      <th scope="col">Crossovers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topComplexChartsRows.map((row, idx) => {
                      const displayTitle = showTransliterationBeta
                        ? (row.meta.titleTranslit || row.meta.title)
                        : row.meta.title;
                      const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                      return (
                        <tr key={`${getChartIdentity(row.meta)}-complex`}>
                          <td className="numeric"><span className="stats-number">{idx + 1}</span></td>
                          <td className="numeric">{row.meta.level}</td>
                          <td>
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(row.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                          </td>
                          <td className="numeric"><span className="stats-number">{Math.round(row.complexity).toLocaleString()}</span></td>
                          <td className="numeric">
                            {(row.bpmMin > 0 || row.bpmMax > 0)
                              ? `${Math.round(row.bpmMin || row.bpmMax)}-${Math.round(row.bpmMax || row.bpmMin)}`
                              : 'N/A'}
                          </td>
                          <td className="numeric">{Math.round(row.stops).toLocaleString()}</td>
                          <td className="numeric">{Math.round(row.technicalMoves).toLocaleString()}</td>
                          <td className="numeric">{row.notesPerSecond.toFixed(2)}</td>
                          <td className="numeric">{row.maxNps.toFixed(2)}</td>
                          <td className="numeric">{Math.round(row.crossovers).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No chart metadata available to rank complexity yet.</div>
            )}
          </section>
        ) : selectedStatView === 'efficientClears' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Most Efficient Clears</h2>
              <span className="stats-summary">Score output per unit of technical complexity</span>
            </div>
            <p className="stats-subtitle">Find charts where your execution is highly efficient for the chart demand.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading efficiency index…</div>
            ) : efficientClearRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Level</th>
                      <th scope="col">Song</th>
                      <th scope="col">Score</th>
                      <th scope="col">Lamp</th>
                      <th scope="col">Efficiency</th>
                      <th scope="col">Complexity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {efficientClearRows.map((row) => {
                      const displayTitle = showTransliterationBeta
                        ? (row.meta.titleTranslit || row.meta.title)
                        : row.meta.title;
                      const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                      return (
                        <tr key={`${getChartIdentity(row.meta)}-efficient`}>
                          <td className="numeric">{row.level}</td>
                          <td>
                            <button
                              type="button"
                              className="stats-song-link"
                              onClick={() => openChartFromMeta(row.meta)}
                              title="Open chart in BPM page"
                            >
                              {displayTitle} ({difficulty})
                            </button>
                          </td>
                          <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                          <td>{row.lamp || '-'}</td>
                          <td className="numeric">{row.efficiencyIndex.toFixed(2)}</td>
                          <td className="numeric">{Math.round(row.complexity).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">Not enough non-failed scores to estimate efficiency.</div>
            )}
          </section>
        ) : selectedStatView === 'rankedDelta' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Ranked Difficulty Delta</h2>
              <span className="stats-summary">Score delta vs your ranked-rating bucket average</span>
            </div>
            <p className="stats-subtitle">Shows where you punch above or below expectation at decimal difficulty.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading ranked-rating deltas…</div>
            ) : rankedDifficultyDeltaRows.length > 0 ? (
              <>
                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Top Positive Delta</th>
                        <th scope="col">Rated Lv</th>
                        <th scope="col">Score</th>
                        <th scope="col">Bucket Avg</th>
                        <th scope="col">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedDeltaOverRows.map((row) => {
                        const displayTitle = showTransliterationBeta
                          ? (row.meta.titleTranslit || row.meta.title)
                          : row.meta.title;
                        const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                        return (
                          <tr key={`${getChartIdentity(row.meta)}-rplus`}>
                            <td>
                              <button
                                type="button"
                                className="stats-song-link"
                                onClick={() => openChartFromMeta(row.meta)}
                                title="Open chart in BPM page"
                              >
                                {displayTitle} ({difficulty})
                              </button>
                            </td>
                            <td className="numeric">{row.rating.toFixed(2)}</td>
                            <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                            <td className="numeric">{Math.round(row.bucketAverage).toLocaleString()}</td>
                            <td className="numeric stats-positive">{formatSigned(row.delta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="stats-table-wrapper">
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th scope="col">Top Negative Delta</th>
                        <th scope="col">Rated Lv</th>
                        <th scope="col">Score</th>
                        <th scope="col">Bucket Avg</th>
                        <th scope="col">Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedDeltaUnderRows.map((row) => {
                        const displayTitle = showTransliterationBeta
                          ? (row.meta.titleTranslit || row.meta.title)
                          : row.meta.title;
                        const difficulty = row.meta.difficulty ? row.meta.difficulty.toUpperCase() : 'N/A';
                        return (
                          <tr key={`${getChartIdentity(row.meta)}-rminus`}>
                            <td>
                              <button
                                type="button"
                                className="stats-song-link"
                                onClick={() => openChartFromMeta(row.meta)}
                                title="Open chart in BPM page"
                              >
                                {displayTitle} ({difficulty})
                              </button>
                            </td>
                            <td className="numeric">{row.rating.toFixed(2)}</td>
                            <td className="numeric">{Math.round(row.score).toLocaleString()}</td>
                            <td className="numeric">{Math.round(row.bucketAverage).toLocaleString()}</td>
                            <td className="numeric stats-negative">{formatSigned(row.delta)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="stats-empty">No ranked-rating metadata available for your scored charts.</div>
            )}
          </section>
        ) : selectedStatView === 'techniqueImbalance' ? (
          <section className="stats-card">
            <div className="stats-card-header">
              <h2>Technique Imbalance</h2>
              <span className="stats-summary">Ratio checks for movement skew</span>
            </div>
            <p className="stats-subtitle">Highlights whether your aggregate style is balanced or heavily skewed.</p>

            {awaitingInitialStats || bpmDataLoading ? (
              <div className="stats-empty">Loading imbalance checks…</div>
            ) : techniqueImbalanceRows.length > 0 ? (
              <div className="stats-table-wrapper">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th scope="col">Metric</th>
                      <th scope="col">Current</th>
                      <th scope="col">Target Band</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {techniqueImbalanceRows.map((row) => (
                      <tr key={`imbalance-${row.label}`}>
                        <td>{row.label}</td>
                        <td className="numeric">{Number.isFinite(row.value) ? row.value.toFixed(2) : '-'}</td>
                        <td className="numeric">{row.target}</td>
                        <td className={row.status === 'Balanced' ? 'stats-positive' : (row.status === 'N/A' ? 'stats-neutral' : 'stats-negative')}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">No score data yet to evaluate technique balance.</div>
            )}
          </section>
        ) : (
          <section className="stats-card">
            <div className="stats-empty">Unknown stats view selected.</div>
          </section>
        )}
      </main>
    </div>
  );
};

export default StatsPage;
