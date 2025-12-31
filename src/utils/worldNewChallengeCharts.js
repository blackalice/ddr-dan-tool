import { buildChartId } from './chartIds.js';
import { WORLD_NEW_CHALLENGE_CHART_IDS } from './worldNewChallengeChartsData.js';

const WORLD_NEW_CHALLENGE_CHART_ID_SET = new Set(WORLD_NEW_CHALLENGE_CHART_IDS);

export const applyWorldNewChallengeCharts = (songMeta, enabled) => {
  if (enabled) return songMeta;
  if (!Array.isArray(songMeta) || songMeta.length === 0) return songMeta;

  let anyChanged = false;
  const next = songMeta.map(song => {
    if (!song || !Array.isArray(song.difficulties) || song.difficulties.length === 0) {
      return song;
    }
    let changed = false;
    const filtered = song.difficulties.filter(diff => {
      if (!diff) return false;
      const diffName = String(diff.difficulty || '').toLowerCase();
      if (diffName !== 'challenge') return true;
      const chartId = diff.chartId || buildChartId(song.id, diff.mode, diff.difficulty);
      if (!chartId) return true;
      const shouldRemove = WORLD_NEW_CHALLENGE_CHART_ID_SET.has(chartId);
      if (shouldRemove) changed = true;
      return !shouldRemove;
    });
    if (!changed) return song;
    anyChanged = true;
    return { ...song, difficulties: filtered };
  });

  return anyChanged ? next : songMeta;
};

export const applyWorldNewChallengeChartsToSimfile = (simfileData, enabled) => {
  if (enabled || !simfileData || !Array.isArray(simfileData.availableTypes)) {
    return simfileData;
  }

  const filteredTypes = simfileData.availableTypes.filter(type => {
    if (!type) return false;
    const diffName = String(type.difficulty || '').toLowerCase();
    if (diffName !== 'challenge') return true;
    const chartId = type.chartId;
    return !chartId || !WORLD_NEW_CHALLENGE_CHART_ID_SET.has(chartId);
  });

  if (filteredTypes.length === simfileData.availableTypes.length) {
    return simfileData;
  }

  const keepSlugs = new Set(filteredTypes.map(type => type.slug));
  const nextCharts = {};
  for (const [slug, chart] of Object.entries(simfileData.charts || {})) {
    if (keepSlugs.has(slug)) nextCharts[slug] = chart;
  }

  return {
    ...simfileData,
    availableTypes: filteredTypes,
    charts: nextCharts,
  };
};

export { WORLD_NEW_CHALLENGE_CHART_IDS };
