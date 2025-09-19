import React, { useContext, useMemo } from 'react';
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
  const { stats, scores } = useScores();
  const { user } = useAuth();

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

  const hasUploadedScores = useMemo(() => {
    if (!scores || typeof scores !== 'object') return false;
    return ['single', 'double'].some(mode => {
      const entries = scores?.[mode];
      return entries && typeof entries === 'object' && Object.keys(entries).length > 0;
    });
  }, [scores]);

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
  const hasScores = totals.played > 0;
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
        <section className="stats-card">
          <div className="stats-card-header">
            <h2>Results by Level</h2>
            <span className="stats-tag">Playstyle: {playStyleLabel}</span>
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
      </main>
    </div>
  );
};

export default StatsPage;
