import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
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
  const { playStyle, theme, worldDifficultyChanges, worldRemoveChallengeCharts } = useContext(SettingsContext);
  const { stats, scores, ensureStats, loadChartMeta } = useScores();
  const { user } = useAuth();
  const [chartMetaLookup, setChartMetaLookup] = useState(() => new Map());
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
                                  <span>{bucket.count} chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? `${Math.round(bucket.avgScore).toLocaleString()} avg` : 'No score'}</span>
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
                                  <span>{bucket.count} chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? `${Math.round(bucket.avgScore).toLocaleString()} avg` : 'No score'}</span>
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
        ) : (
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
                                  <span>{bucket.count} chart{bucket.count === 1 ? '' : 's'}</span>
                                  <span>{bucket.avgScore != null ? `${Math.round(bucket.avgScore).toLocaleString()} avg` : 'No score'}</span>
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
        )}
      </main>
    </div>
  );
};

export default StatsPage;
