/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/remoteStorage.js';
import {
  normalizeDifficultyName,
  normalizeMode,
  upgradeChartId,
} from '../utils/chartIds.js';
import { normalizeSongIdValue } from '../utils/songId.js';

const defaultGroups = [];
const MAX_GROUPS = 20;

function normalizeChart(chart) {
  if (!chart || typeof chart !== 'object') return chart;
  const upgradedId = chart.chartId ? upgradeChartId(chart.chartId) : null;
  const normalizedSongId = chart.songId ? normalizeSongIdValue(chart.songId) : null;
  if (!upgradedId && !normalizedSongId) return chart;
  return {
    ...chart,
    ...(upgradedId ? { chartId: upgradedId } : {}),
    ...(normalizedSongId ? { songId: normalizedSongId } : {}),
  };
}

function chartKey(chart) {
  if (!chart) return '';
  const normalizedChart = normalizeChart(chart) || chart;
  if (normalizedChart.chartId) {
    const upgraded = upgradeChartId(normalizedChart.chartId);
    if (upgraded) return upgraded;
  }
  const songId = normalizeSongIdValue(normalizedChart.songId);
  const mode = normalizeMode(normalizedChart.mode);
  const difficulty = normalizeDifficultyName(normalizedChart.difficulty);
  if (songId && mode && difficulty) {
    return `${songId}#${mode}#${difficulty}`;
  }
  const title = String(normalizedChart.title || '').toLowerCase();
  return `${title}::${mode || ''}::${difficulty || ''}`;
}

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return defaultGroups;
  return groups.map(group => ({
    ...group,
    charts: Array.isArray(group.charts)
      ? group.charts.map(c => normalizeChart(c))
      : [],
  }));
}

export const GroupsContext = createContext();

export const GroupsProvider = ({ children }) => {
  const [groups, setGroups] = useState(() => {
    const saved = storage.getItem('groups');
    if (!saved) return defaultGroups;
    try {
      const parsed = JSON.parse(saved);
      return normalizeGroups(parsed);
    } catch {
      return defaultGroups;
    }
  });
  const [activeGroup, setActiveGroup] = useState(() =>
    storage.getItem('activeGroup') || 'All'
  );

  useEffect(() => {
    storage.setItem('groups', JSON.stringify(groups));
  }, [groups]);

  useEffect(() => {
    storage.setItem('activeGroup', activeGroup);
  }, [activeGroup]);

  useEffect(() => {
    if (activeGroup !== 'All' && !groups.some(g => g.name === activeGroup)) {
      setActiveGroup('All');
    }
  }, [groups, activeGroup]);

  const createGroup = (name) => {
    if (groups.length >= MAX_GROUPS) {
      alert(`You have reached the maximum of ${MAX_GROUPS} lists.`);
      return false;
    }
    if (!name || groups.some(g => g.name === name)) {
      alert('A list with this name already exists.');
      return false;
    }
    setGroups(prev => [...prev, { name, charts: [], color: 'var(--accent-color)' }]);
    return true;
  };

  const deleteGroup = (name) => {
    setGroups(prev => prev.filter(g => g.name !== name));
  };

  const updateGroupColor = (name, color) => {
    setGroups(prev => prev.map(g => g.name === name ? { ...g, color } : g));
  };

  const updateGroupName = (oldName, newName) => {
    if (!newName || groups.some(g => g.name === newName && g.name !== oldName)) {
      alert('A list with this name already exists.');
      return false;
    }
    setGroups(prev => prev.map(g => g.name === oldName ? { ...g, name: newName } : g));
    return true;
  };

  const addChartsToGroup = (name, charts) => {
    setGroups(prev => prev.map(g => {
      if (g.name !== name) return g;
      const existingChartIds = new Set(g.charts.map(c => chartKey(c)));
      const appended = [];
      for (const chart of charts) {
        const normalized = normalizeChart(chart);
        const key = chartKey(normalized);
        if (existingChartIds.has(key)) continue;
        existingChartIds.add(key);
        appended.push(normalized);
      }
      if (appended.length === 0) return g;
      return { ...g, charts: [...g.charts, ...appended] };
    }));
  };

  const addChartToGroup = (name, chart) => {
    const normalizedChart = normalizeChart(chart);
    const key = chartKey(normalizedChart);
    setGroups(prev => prev.map(g => {
      if (g.name !== name) return g;
      const exists = g.charts.some(c => chartKey(c) === key);
      if (exists) return g;
      return { ...g, charts: [...g.charts, normalizedChart] };
    }));
  };

  const removeChartFromGroup = (name, chart) => {
    const key = chartKey(chart);
    setGroups(prev => prev.map(g => g.name === name ? {
      ...g,
      charts: g.charts.filter(c => chartKey(c) !== key)
    } : g));
  };

  const updateChartDifficulty = (name, chart, newDiff) => {
    const targetKey = chartKey(chart);
    const normalizedDiff = normalizeChart(newDiff);
    setGroups(prev => prev.map(g => g.name === name ? {
      ...g,
      charts: g.charts.map(c =>
        chartKey(c) === targetKey
          ? {
              ...c,
              difficulty: normalizedDiff.difficulty?.toLowerCase() || c.difficulty,
              level: normalizedDiff.feet,
              rankedRating: normalizedDiff.rankedRating,
              chartId: normalizedDiff.chartId || c.chartId,
              songId: normalizedDiff.songId || c.songId,
            }
          : c
      )
    } : g));
  };

  const reorderGroupCharts = (name, newOrderIds) => {
    const idOf = (c) => chartKey(c) || `${c.title}::${c.mode}::${c.difficulty}`;
    setGroups(prev => prev.map(g => {
      if (g.name !== name) return g;
      const byId = new Map(g.charts.map(c => [idOf(c), c]));
      const reordered = [];
      for (const id of newOrderIds) {
        const c = byId.get(id);
        if (c) {
          reordered.push(c);
          byId.delete(id);
        }
      }
      // Append any charts not present in newOrderIds to preserve data
      for (const c of byId.values()) reordered.push(c);
      return { ...g, charts: reordered };
    }));
  };

  return (
    <GroupsContext.Provider value={{
      groups,
      setGroups,
      createGroup,
      deleteGroup,
      addChartToGroup,
      removeChartFromGroup,
      updateGroupColor,
      addChartsToGroup,
      updateGroupName,
      updateChartDifficulty,
      reorderGroupCharts,
      activeGroup,
      setActiveGroup,
    }}>
      {children}
    </GroupsContext.Provider>
  );
};

export const useGroups = () => useContext(GroupsContext);
