import React, { useMemo } from 'react';
import './ChartStatsPanel.css';

const formatNumber = (value, decimals = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const formatSeconds = (value, decimals = 2) => `${formatNumber(value, decimals)}s`;
const formatPercent = (value, decimals = 2) => `${formatNumber(value, decimals)}%`;

const Stat = ({ label, value, unit = '' }) => (
  <div className="chart-stats-item">
    <span className="chart-stats-item-label">{label}</span>
    <span className="chart-stats-item-value">{value}{unit}</span>
  </div>
);

const StatCard = ({ title, subtitle, children }) => (
  <section className="chart-stats-card">
    <div className="chart-stats-card-header">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
    </div>
    <div className="chart-stats-card-grid">
      {children}
    </div>
  </section>
);

const QUANTIZATION_ORDER = ['4th Notes', '8th Notes', '12th Notes', '16th Notes', '20th Notes', '24th Notes', '32nd Notes', '48th Notes', '64th Notes', '96th Notes', '192nd Notes'];

const formatCountWithMax = (value, metricKey, levelStatMaxima) => {
  const current = Number(value);
  if (!Number.isFinite(current)) return '--';
  const max = Number(levelStatMaxima?.[metricKey]);
  if (!Number.isFinite(max)) return formatNumber(current, 0);
  return (
    <>
      {formatNumber(current, 0)}
      <span className="chart-stats-item-out-of">/{formatNumber(max, 0)}</span>
    </>
  );
};

const formatWithMax = (value, metricKey, levelStatMaxima, decimals = 2) => {
  const current = Number(value);
  if (!Number.isFinite(current)) return '--';
  const max = Number(levelStatMaxima?.[metricKey]);
  if (!Number.isFinite(max)) return formatNumber(current, decimals);
  return (
    <>
      {formatNumber(current, decimals)}
      <span className="chart-stats-item-out-of">/{formatNumber(max, decimals)}</span>
    </>
  );
};

const formatSecondsWithMax = (value, metricKey, levelStatMaxima, decimals = 3) => {
  const current = Number(value);
  if (!Number.isFinite(current)) return '--';
  const max = Number(levelStatMaxima?.[metricKey]);
  if (!Number.isFinite(max)) return formatSeconds(current, decimals);
  return (
    <>
      {formatSeconds(current, decimals)}
      <span className="chart-stats-item-out-of">/{formatSeconds(max, decimals)}</span>
    </>
  );
};

const ChartStatsPanel = ({ metrics, songLength, chartLevel, levelStatMaxima }) => {
  const stats = metrics?.debugStats && typeof metrics.debugStats === 'object'
    ? metrics.debugStats
    : null;

  const quantizationItems = useMemo(() => {
    const counts = stats?.quantizationCounts && typeof stats.quantizationCounts === 'object'
      ? stats.quantizationCounts
      : {};
    return QUANTIZATION_ORDER
      .map((label) => ({ label, count: Number(counts[label]) || 0 }))
      .filter((entry) => entry.count > 0);
  }, [stats]);

  if (!stats) {
    return (
      <div className="chart-stats-panel">
        <section className="chart-stats-empty">
          <h3>No chart stats available</h3>
          <p>Select a chart to view detailed statistics.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="chart-stats-panel">
      <div className="chart-stats-layout">
        <StatCard title="Overview" subtitle={chartLevel != null ? `Core note counts and timeline (level ${chartLevel} max)` : 'Core note counts and timeline'}>
          <Stat label="Total notes" value={formatCountWithMax(stats.notes, 'notes', levelStatMaxima)} />
          <Stat label="Steps" value={formatCountWithMax(stats.steps, 'steps', levelStatMaxima)} />
          <Stat label="Holds" value={formatCountWithMax(stats.holds, 'holds', levelStatMaxima)} />
          <Stat label="Jumps" value={formatCountWithMax(stats.jumps, 'jumps', levelStatMaxima)} />
          <Stat label="Hands" value={formatCountWithMax(stats.hands, 'hands', levelStatMaxima)} />
          <Stat label="Quads" value={formatCountWithMax(stats.quads, 'quads', levelStatMaxima)} />
          <Stat label="Shock arrows" value={formatCountWithMax(stats.shocks, 'shocks', levelStatMaxima)} />
          <Stat label="Chart start" value={formatSeconds(stats.chartStart)} />
          <Stat label="Chart length" value={formatSeconds(stats.chartLength)} />
          <Stat label="Song length" value={formatSeconds(songLength ?? stats.chartSeconds)} />
        </StatCard>

        <StatCard title="Density" subtitle="Sustained speed and bursts">
          <Stat label="Notes / second" value={formatWithMax(stats.notesPerSecond, 'notesPerSecond', levelStatMaxima)} />
          <Stat label="Steps / second" value={formatWithMax(stats.stepsPerSecond, 'stepsPerSecond', levelStatMaxima)} />
          <Stat label="Max NPS" value={formatWithMax(stats.maximumNotesPerSecond, 'maximumNotesPerSecond', levelStatMaxima)} />
          <Stat label="Mean NPS" value={formatWithMax(stats.meanNotesPerSecond, 'meanNotesPerSecond', levelStatMaxima)} />
          <Stat label="Median NPS" value={formatWithMax(stats.medianNotesPerSecond, 'medianNotesPerSecond', levelStatMaxima)} />
          <Stat label="Fastest 3-note burst" value={formatWithMax(stats.fastest3NoteBurst, 'fastest3NoteBurst', levelStatMaxima)} />
          <Stat label="Fastest 7-note run" value={formatWithMax(stats.fastest7NoteRun, 'fastest7NoteRun', levelStatMaxima)} />
          <Stat label="Fastest 15-note run" value={formatWithMax(stats.fastest15NoteRun, 'fastest15NoteRun', levelStatMaxima)} />
          <Stat label="Max gap between notes" value={formatSecondsWithMax(stats.maxTimeBetweenNotes, 'maxTimeBetweenNotes', levelStatMaxima, 3)} />
        </StatCard>

        <StatCard title="Footwork" subtitle={`Pattern analysis (${stats.footworkMethod || 'heuristic'})`}>
          <Stat label="Crossovers" value={formatCountWithMax(stats.crossovers, 'crossovers', levelStatMaxima)} />
          <Stat label="Half crossovers" value={formatCountWithMax(stats.halfCrossovers, 'halfCrossovers', levelStatMaxima)} />
          <Stat label="Full crossovers" value={formatCountWithMax(stats.fullCrossovers, 'fullCrossovers', levelStatMaxima)} />
          <Stat label="Hold crossovers" value={formatCountWithMax(stats.holdCrossovers, 'holdCrossovers', levelStatMaxima)} />
          <Stat label="Footswitches" value={formatCountWithMax(stats.footswitches, 'footswitches', levelStatMaxima)} />
          <Stat label="Sideswitches" value={formatCountWithMax(stats.sideswitches, 'sideswitches', levelStatMaxima)} />
          <Stat label="Jacks" value={formatCountWithMax(stats.jacks, 'jacks', levelStatMaxima)} />
          <Stat label="Brackets" value={formatCountWithMax(stats.brackets, 'brackets', levelStatMaxima)} />
          <Stat label="Doublesteps" value={formatCountWithMax(stats.doublesteps, 'doublesteps', levelStatMaxima)} />
        </StatCard>

        <StatCard title="Advanced Patterns" subtitle="Technical movement motifs">
          <Stat label="Anchors" value={formatCountWithMax(stats.anchors, 'anchors', levelStatMaxima)} />
          <Stat label="Spins 180" value={formatCountWithMax(stats.spins180, 'spins180', levelStatMaxima)} />
          <Stat label="Spins 360" value={formatCountWithMax(stats.spins360, 'spins360', levelStatMaxima)} />
          <Stat label="Staircases" value={formatCountWithMax(stats.staircases, 'staircases', levelStatMaxima)} />
          <Stat label="Rolls" value={formatCountWithMax(stats.rolls, 'rolls', levelStatMaxima)} />
          <Stat label="Candles" value={formatCountWithMax(stats.candles, 'candles', levelStatMaxima)} />
          <Stat label="Drills" value={formatCountWithMax(stats.drills, 'drills', levelStatMaxima)} />
          <Stat label="Gallops" value={formatCountWithMax(stats.gallops, 'gallops', levelStatMaxima)} />
        </StatCard>

        <StatCard title="Flow Patterns" subtitle="Run and section-level structure">
          <Stat label="Mono runs" value={formatCountWithMax(stats.monoRuns, 'monoRuns', levelStatMaxima)} />
          <Stat label="Streams" value={formatCountWithMax(stats.streamCount, 'streamCount', levelStatMaxima)} />
          <Stat label="Stream notes" value={formatCountWithMax(stats.streamNotes, 'streamNotes', levelStatMaxima)} />
          <Stat label="Bursts" value={formatCountWithMax(stats.bursts, 'bursts', levelStatMaxima)} />
        </StatCard>

        <StatCard title="Tempo & Timing" subtitle="BPM movement and stop behavior">
          <Stat label="BPM min" value={formatNumber(stats.bpmMin)} />
          <Stat label="BPM max" value={formatNumber(stats.bpmMax)} />
          <Stat label="BPM range" value={formatNumber(stats.bpmRange)} />
          <Stat label="BPM changes" value={formatNumber(stats.bpmChanges, 0)} />
          <Stat label="Stops" value={formatCountWithMax(stats.stops, 'stops', levelStatMaxima)} />
          <Stat label="Total stop duration" value={formatSeconds(stats.totalStopDuration)} />
          <Stat label="Stop % of chart" value={formatPercent(stats.stopPercentOfChart)} />
          <Stat label="Shortest stop" value={formatSeconds(stats.shortestStop, 3)} />
          <Stat label="Longest stop" value={formatSeconds(stats.longestStop, 3)} />
        </StatCard>

        <StatCard title="Directional Balance" subtitle="Arrow distribution and lane bias">
          <Stat label="Left notes" value={formatNumber(stats.leftNotes, 0)} />
          <Stat label="Down notes" value={formatNumber(stats.downNotes, 0)} />
          <Stat label="Up notes" value={formatNumber(stats.upNotes, 0)} />
          <Stat label="Right notes" value={formatNumber(stats.rightNotes, 0)} />
          <Stat label="Lopsidedness (max)" value={formatPercent((Number(stats.lopsidednessByMax) || 0) * 100)} />
          <Stat label="Lopsidedness (mean)" value={formatPercent((Number(stats.lopsidednessByMean) || 0) * 100)} />
          <Stat label="Left/Right bias" value={formatPercent((Number(stats.leftRightBias) || 0) * 100)} />
          <Stat label="Down/Up bias" value={formatPercent((Number(stats.downUpBias) || 0) * 100)} />
          <Stat label="Horizontal bias" value={formatPercent((Number(stats.horizontalVerticalBias) || 0) * 100)} />
        </StatCard>

        <section className="chart-stats-card chart-stats-quantization">
          <div className="chart-stats-card-header">
            <h3>Rhythm Quantization</h3>
            <p>Distribution by note fraction across the selected chart.</p>
          </div>
          <div className="chart-stats-card-grid">
            <Stat label="Most frequent" value={stats.mostFrequentQuantizations || '--'} />
            <Stat label="Finest" value={stats.finestQuantization || '--'} />
              {quantizationItems.length === 0 ? (
                <Stat label="Quantization data" value="No data" />
              ) : (
                quantizationItems.map((entry) => (
                <Stat key={entry.label} label={entry.label} value={formatNumber(entry.count, 0)} />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ChartStatsPanel;
