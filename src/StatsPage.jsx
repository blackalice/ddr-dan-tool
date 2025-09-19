import React, { useContext, useEffect, useMemo, useState } from 'react';
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
import { getSongMeta } from './utils/cachedFetch.js';
import { resolveScore } from './utils/scoreKey.js';
import './StatsPage.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const LEVELS = Array.from({ length: 19 }, (_, idx) => idx + 1);
const AAA_THRESHOLD = 990000;

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

const parseScore = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
  const { playStyle, theme } = useContext(SettingsContext);
  const { scores } = useScores();
  const [songMeta, setSongMeta] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSongMeta()
      .then((data) => {
        if (cancelled) return;
        setSongMeta(Array.isArray(data) ? data : []);
        setLoadError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setSongMeta([]);
        setLoadError(err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { levelSummaries, totals, hasOther } = useMemo(() => {
    const buckets = LEVELS.reduce((acc, level) => {
      acc[level] = { level, total: 0, mfc: 0, pfc: 0, aaa: 0, fail: 0, other: 0 };
      return acc;
    }, {});

    const normalizedPlayStyle = playStyle === 'double' ? 'double' : 'single';

    for (const song of songMeta) {
      const difficulties = song?.difficulties;
      if (!Array.isArray(difficulties)) continue;

      for (const diff of difficulties) {
        if (!diff || diff.mode !== normalizedPlayStyle) continue;
        const level = Number(diff.feet);
        if (!Number.isFinite(level) || level < 1 || level > 19) continue;

        const result = resolveScore(scores, diff.mode, {
          chartId: diff.chartId,
          songId: song.id,
          title: song.title,
          artist: song.artist,
          difficulty: diff.difficulty,
        });

        if (!result) continue;
        const normalizedLamp = typeof result.lamp === 'string' ? result.lamp.toLowerCase() : '';
        if (normalizedLamp.includes('no play')) continue;

        const bucket = buckets[level];
        bucket.total += 1;

        const scoreValue = parseScore(result.score);

        if (normalizedLamp.includes('marvelous')) {
          bucket.mfc += 1;
        } else if (normalizedLamp.includes('perfect')) {
          bucket.pfc += 1;
        } else if (normalizedLamp.includes('failed') || (!normalizedLamp && scoreValue == null)) {
          bucket.fail += 1;
        } else if (scoreValue != null && scoreValue >= AAA_THRESHOLD) {
          bucket.aaa += 1;
        } else {
          bucket.other += 1;
        }
      }
    }

    const summaries = LEVELS.map(level => buckets[level]);
    const totalsAcc = summaries.reduce((acc, entry) => {
      acc.played += entry.total;
      acc.mfc += entry.mfc;
      acc.pfc += entry.pfc;
      acc.aaa += entry.aaa;
      acc.fail += entry.fail;
      acc.other += entry.other;
      return acc;
    }, { played: 0, mfc: 0, pfc: 0, aaa: 0, fail: 0, other: 0 });

    const otherPresent = summaries.some(entry => entry.other > 0);

    return { levelSummaries: summaries, totals: totalsAcc, hasOther: otherPresent };
  }, [songMeta, scores, playStyle]);

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
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: levelSummaries.map(entry => entry[ds.key] || 0),
        backgroundColor: ds.color,
        stack: 'counts',
        borderRadius: 8,
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
  const hasScores = totals.played > 0;

  return (
    <div className="app-container">
      <main className="stats-page">
        <header className="stats-header">
          <h1>Stats Overview</h1>
          <p>Clear distribution for your {playStyleLabel} charts across levels 1–19.</p>
        </header>

        <section className="stats-card">
          <div className="stats-card-header">
            <h2>Results by Level</h2>
            <span className="stats-tag">Playstyle: {playStyleLabel}</span>
          </div>
          <p className="stats-subtitle">Stacked bars show how many charts you&apos;ve logged per level, split by result.</p>

          {loading ? (
            <div className="stats-empty">Loading stats…</div>
          ) : loadError ? (
            <div className="stats-empty">Unable to load song data right now.</div>
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
      </main>
    </div>
  );
};

export default StatsPage;
