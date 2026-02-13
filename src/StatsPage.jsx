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
          font: { size: 12, family: 'Inter, system-ui, sans-serif' },
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
          font: { size: 12, family: 'Inter, system-ui, sans-serif' },
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
        ) : (
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
        )}
      </main>
    </div>
  );
};

export default StatsPage;
