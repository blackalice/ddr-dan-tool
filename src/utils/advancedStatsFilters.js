const buildRangeMetric = (key, label, options = {}) => {
  const {
    min = 0,
    max = 2000,
    step = 1,
    allowDecimal = false,
  } = options;
  return {
    key,
    label,
    min,
    max,
    step,
    allowDecimal,
  };
};

export const ADVANCED_FILTER_SECTIONS = [
  {
    key: 'overview',
    title: 'Overview',
    subtitle: 'Core note counts',
    metrics: [
      buildRangeMetric('notes', 'Total Notes', { max: 5000 }),
      buildRangeMetric('steps', 'Steps', { max: 5000 }),
      buildRangeMetric('holds', 'Holds'),
      buildRangeMetric('jumps', 'Jumps'),
      buildRangeMetric('hands', 'Hands'),
      buildRangeMetric('quads', 'Quads'),
      buildRangeMetric('shocks', 'Shock Arrows'),
    ],
  },
  {
    key: 'density',
    title: 'Density',
    subtitle: 'Sustained speed and bursts',
    metrics: [
      buildRangeMetric('notesPerSecond', 'Notes / second', { max: 25, step: 0.01, allowDecimal: true }),
      buildRangeMetric('stepsPerSecond', 'Steps / second', { max: 25, step: 0.01, allowDecimal: true }),
      buildRangeMetric('maximumNotesPerSecond', 'Max NPS', { max: 40, step: 0.01, allowDecimal: true }),
      buildRangeMetric('meanNotesPerSecond', 'Mean NPS', { max: 25, step: 0.01, allowDecimal: true }),
      buildRangeMetric('medianNotesPerSecond', 'Median NPS', { max: 25, step: 0.01, allowDecimal: true }),
      buildRangeMetric('fastest3NoteBurst', 'Fastest 3-note burst', { max: 40, step: 0.01, allowDecimal: true }),
      buildRangeMetric('fastest7NoteRun', 'Fastest 7-note run', { max: 40, step: 0.01, allowDecimal: true }),
      buildRangeMetric('fastest15NoteRun', 'Fastest 15-note run', { max: 40, step: 0.01, allowDecimal: true }),
      buildRangeMetric('maxTimeBetweenNotes', 'Max gap between notes (s)', { max: 10, step: 0.001, allowDecimal: true }),
    ],
  },
  {
    key: 'footwork',
    title: 'Footwork',
    subtitle: 'Pattern analysis',
    metrics: [
      buildRangeMetric('crossovers', 'Crossovers'),
      buildRangeMetric('halfCrossovers', 'Half Crossovers'),
      buildRangeMetric('fullCrossovers', 'Full Crossovers'),
      buildRangeMetric('holdCrossovers', 'Hold Crossovers'),
      buildRangeMetric('footswitches', 'Footswitches'),
      buildRangeMetric('sideswitches', 'Sideswitches'),
      buildRangeMetric('jacks', 'Jacks'),
      buildRangeMetric('brackets', 'Brackets'),
      buildRangeMetric('doublesteps', 'Doublesteps'),
    ],
  },
  {
    key: 'flow',
    title: 'Flow Patterns',
    subtitle: 'Run and section-level structure',
    metrics: [
      buildRangeMetric('monoRuns', 'Mono Runs'),
      buildRangeMetric('streams', 'Streams'),
      buildRangeMetric('streamNotes', 'Stream Notes', { max: 5000 }),
      buildRangeMetric('bursts', 'Bursts'),
    ],
  },
  {
    key: 'advanced',
    title: 'Advanced Patterns',
    subtitle: 'Technical movement motifs',
    metrics: [
      buildRangeMetric('anchors', 'Anchors'),
      buildRangeMetric('spins180', 'Spins 180'),
      buildRangeMetric('spins360', 'Spins 360'),
      buildRangeMetric('staircases', 'Staircases'),
      buildRangeMetric('rolls', 'Rolls'),
      buildRangeMetric('candles', 'Candles'),
      buildRangeMetric('drills', 'Drills'),
      buildRangeMetric('gallops', 'Gallops'),
    ],
  },
  {
    key: 'stops',
    title: 'Stops',
    subtitle: 'Stop count across the chart',
    metrics: [
      buildRangeMetric('stops', 'Stops', { max: 200 }),
    ],
  },
];

export const ADVANCED_FILTER_METRICS = ADVANCED_FILTER_SECTIONS.flatMap((section) => section.metrics);

export const ADVANCED_FILTER_DEFAULTS = ADVANCED_FILTER_METRICS.reduce((acc, metric) => {
  acc[`${metric.key}Min`] = '';
  acc[`${metric.key}Max`] = '';
  return acc;
}, {});

export function hasActiveAdvancedFilters(filters) {
  if (!filters || typeof filters !== 'object') return false;
  return ADVANCED_FILTER_METRICS.some((metric) => {
    const minKey = `${metric.key}Min`;
    const maxKey = `${metric.key}Max`;
    const min = filters[minKey];
    const max = filters[maxKey];
    return (min != null && min !== '') || (max != null && max !== '');
  });
}

function metricInRange(value, minRaw, maxRaw) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  if (minRaw !== '' && safeValue < Number(minRaw)) return false;
  if (maxRaw !== '' && safeValue > Number(maxRaw)) return false;
  return true;
}

function getChartMetricValue(chart, metricKey) {
  const value = Number(chart?.stepmaniaTech?.[metricKey]);
  return Number.isFinite(value) ? value : 0;
}

export function chartMatchesAdvancedFilters(chart, filters, options = {}) {
  if (!hasActiveAdvancedFilters(filters)) return true;
  const ignoreMetricKey = options?.ignoreMetricKey;
  return ADVANCED_FILTER_METRICS.every((metric) => {
    if (ignoreMetricKey && metric.key === ignoreMetricKey) return true;
    const minKey = `${metric.key}Min`;
    const maxKey = `${metric.key}Max`;
    const min = filters?.[minKey] ?? '';
    const max = filters?.[maxKey] ?? '';
    if (min === '' && max === '') return true;
    const metricValue = getChartMetricValue(chart, metric.key);
    return metricInRange(metricValue, min, max);
  });
}
