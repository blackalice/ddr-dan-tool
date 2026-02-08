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

const ChartStatsPanel = ({ metrics, songLength }) => {
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
        <StatCard title="Overview" subtitle="Core note counts and timeline">
          <Stat label="Total notes" value={formatNumber(stats.notes, 0)} />
          <Stat label="Steps" value={formatNumber(stats.steps, 0)} />
          <Stat label="Holds" value={formatNumber(stats.holds, 0)} />
          <Stat label="Jumps" value={formatNumber(stats.jumps, 0)} />
          <Stat label="Hands" value={formatNumber(stats.hands, 0)} />
          <Stat label="Quads" value={formatNumber(stats.quads, 0)} />
          <Stat label="Shock arrows" value={formatNumber(stats.shocks, 0)} />
          <Stat label="Chart start" value={formatSeconds(stats.chartStart)} />
          <Stat label="Chart length" value={formatSeconds(stats.chartLength)} />
          <Stat label="Song length" value={formatSeconds(songLength ?? stats.chartSeconds)} />
        </StatCard>

        <StatCard title="Density" subtitle="Sustained speed and bursts">
          <Stat label="Notes / second" value={formatNumber(stats.notesPerSecond)} />
          <Stat label="Steps / second" value={formatNumber(stats.stepsPerSecond)} />
          <Stat label="Max NPS" value={formatNumber(stats.maximumNotesPerSecond)} />
          <Stat label="Mean NPS" value={formatNumber(stats.meanNotesPerSecond)} />
          <Stat label="Median NPS" value={formatNumber(stats.medianNotesPerSecond)} />
          <Stat label="Fastest 3-note burst" value={formatNumber(stats.fastest3NoteBurst)} />
          <Stat label="Fastest 7-note run" value={formatNumber(stats.fastest7NoteRun)} />
          <Stat label="Fastest 15-note run" value={formatNumber(stats.fastest15NoteRun)} />
          <Stat label="Max gap between notes" value={formatSeconds(stats.maxTimeBetweenNotes, 3)} />
        </StatCard>

        <StatCard title="Footwork" subtitle={`Pattern analysis (${stats.footworkMethod || 'heuristic'})`}>
          <Stat label="Crossovers" value={formatNumber(stats.crossovers, 0)} />
          <Stat label="Half crossovers" value={formatNumber(stats.halfCrossovers, 0)} />
          <Stat label="Full crossovers" value={formatNumber(stats.fullCrossovers, 0)} />
          <Stat label="Hold crossovers" value={formatNumber(stats.holdCrossovers, 0)} />
          <Stat label="Footswitches" value={formatNumber(stats.footswitches, 0)} />
          <Stat label="Sideswitches" value={formatNumber(stats.sideswitches, 0)} />
          <Stat label="Jacks" value={formatNumber(stats.jacks, 0)} />
          <Stat label="Brackets" value={formatNumber(stats.brackets, 0)} />
          <Stat label="Doublesteps" value={formatNumber(stats.doublesteps, 0)} />
        </StatCard>

        <StatCard title="Advanced Patterns" subtitle="Technical movement motifs">
          <Stat label="Anchors" value={formatNumber(stats.anchors, 0)} />
          <Stat label="Spins 180" value={formatNumber(stats.spins180, 0)} />
          <Stat label="Spins 360" value={formatNumber(stats.spins360, 0)} />
          <Stat label="Staircases" value={formatNumber(stats.staircases, 0)} />
          <Stat label="Rolls" value={formatNumber(stats.rolls, 0)} />
          <Stat label="Candles" value={formatNumber(stats.candles, 0)} />
          <Stat label="Drills" value={formatNumber(stats.drills, 0)} />
          <Stat label="Gallops" value={formatNumber(stats.gallops, 0)} />
        </StatCard>

        <StatCard title="Flow Patterns" subtitle="Run and section-level structure">
          <Stat label="Mono runs" value={formatNumber(stats.monoRuns, 0)} />
          <Stat label="Streams" value={formatNumber(stats.streamCount, 0)} />
          <Stat label="Stream notes" value={formatNumber(stats.streamNotes, 0)} />
          <Stat label="Bursts" value={formatNumber(stats.bursts, 0)} />
        </StatCard>

        <StatCard title="Tempo & Timing" subtitle="BPM movement and stop behavior">
          <Stat label="BPM min" value={formatNumber(stats.bpmMin)} />
          <Stat label="BPM max" value={formatNumber(stats.bpmMax)} />
          <Stat label="BPM range" value={formatNumber(stats.bpmRange)} />
          <Stat label="BPM changes" value={formatNumber(stats.bpmChanges, 0)} />
          <Stat label="Stops" value={formatNumber(stats.stops, 0)} />
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
