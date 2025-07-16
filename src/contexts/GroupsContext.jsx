import React, { createContext, useContext, useState, useEffect } from 'react';

const defaultGroups = [];

export const GroupsContext = createContext();

export const GroupsProvider = ({ children }) => {
  const [groups, setGroups] = useState(() => {
    const saved = localStorage.getItem('groups');
    return saved ? JSON.parse(saved) : defaultGroups;
  });

  useEffect(() => {
    localStorage.setItem('groups', JSON.stringify(groups));
  }, [groups]);

  const createGroup = (name) => {
    if (!name || groups.some(g => g.name === name)) return;
    setGroups(prev => [...prev, { name, charts: [], color: 'var(--accent-color)' }]);
  };

  const deleteGroup = (name) => {
    setGroups(prev => prev.filter(g => g.name !== name));
  };

  const updateGroupColor = (name, color) => {
    setGroups(prev => prev.map(g => g.name === name ? { ...g, color } : g));
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

  return (
    <GroupsContext.Provider value={{ groups, createGroup, deleteGroup, addChartToGroup, removeChartFromGroup, updateGroupColor }}>
      {children}
    </GroupsContext.Provider>
  );
};

export const useGroups = () => useContext(GroupsContext);
