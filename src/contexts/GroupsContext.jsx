/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/remoteStorage.js';

const defaultGroups = [];
const MAX_GROUPS = 20;

export const GroupsContext = createContext();

export const GroupsProvider = ({ children }) => {
  const [groups, setGroups] = useState(() => {
    const saved = storage.getItem('groups');
    return saved ? JSON.parse(saved) : defaultGroups;
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
      if (g.name === name) {
        const existingChartIds = new Set(g.charts.map(c => `${c.title}-${c.mode}-${c.difficulty}`));
        const newCharts = charts.filter(c => !existingChartIds.has(`${c.title}-${c.mode}-${c.difficulty}`));
        return { ...g, charts: [...g.charts, ...newCharts] };
      }
      return g;
    }));
  };

  const addChartToGroup = (name, chart) => {
    setGroups(prev => prev.map(g => g.name === name ? {
      ...g,
      charts: g.charts.some(c => c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty) ? g.charts : [...g.charts, chart]
    } : g));
  };

  const removeChartFromGroup = (name, chart) => {
    setGroups(prev => prev.map(g => g.name === name ? {
      ...g,
      charts: g.charts.filter(c => !(c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty))
    } : g));
  };

  const updateChartDifficulty = (name, chart, newDiff) => {
    setGroups(prev => prev.map(g => g.name === name ? {
      ...g,
      charts: g.charts.map(c =>
        c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty
          ? { ...c, difficulty: newDiff.difficulty.toLowerCase(), level: newDiff.feet, rankedRating: newDiff.rankedRating }
          : c
      )
    } : g));
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
      activeGroup,
      setActiveGroup,
    }}>
      {children}
    </GroupsContext.Provider>
  );
};

export const useGroups = () => useContext(GroupsContext);
