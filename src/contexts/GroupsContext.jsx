/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext'; // Assuming useAuth provides token

const MAX_GROUPS = 20;

export const GroupsContext = createContext();

export const GroupsProvider = ({ children }) => {
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState('All');

  const fetchGroups = useCallback(async () => {
    if (!token) {
      setGroups([]);
      return;
    }
    try {
      const res = await fetch('/api/lists', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.map(g => ({ ...g, charts: g.songs || [] })));
      } else {
        setGroups([]);
      }
    } catch (err) {
      console.error('Failed to fetch lists', err);
      setGroups([]);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchGroups();
    } else {
      setGroups([]);
    }
  }, [token, fetchGroups]);

  const createGroup = async (name) => {
    if (groups.length >= MAX_GROUPS) {
      alert(`You have reached the maximum of ${MAX_GROUPS} lists.`);
      return null;
    }
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, color: 'var(--accent-color)' }),
      });
      if (res.ok) {
        const newList = await res.json();
        const newGroup = { ...newList, charts: newList.songs || [] };
        setGroups(prev => [...prev, newGroup]);
        return newGroup;
      }
      const errText = await res.text();
      alert(errText);
      return null;
    } catch (err) {
      alert('Failed to create list.');
      return null;
    }
  };

  const deleteGroup = async (id) => {
    try {
      const res = await fetch(`/api/lists/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setGroups(prev => prev.filter(g => g.id !== id));
      } else {
        alert('Failed to delete list.');
      }
    } catch (err) {
      alert('Failed to delete list.');
    }
  };

  const updateGroup = async (id, updates) => {
    console.log(`Context: updateGroup called for id: ${id} with updates:`, updates);
    try {
      const res = await fetch(`/api/lists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        console.log("Context: Successfully updated group on backend. Updating local state.");
        setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates, charts: updates.songs || g.charts } : g));
        return true;
      }
      const errText = await res.text();
      console.error("Context: Failed to update list on backend:", errText);
      alert(errText);
      return false;
    } catch (err) {
      console.error("Context: Network error while updating list:", err);
      alert('Failed to update list.');
      return false;
    }
  };

  const updateGroupColor = (id, color) => updateGroup(id, { color });
  const updateGroupName = (id, name) => updateGroup(id, { name });

  const addChartsToGroup = (id, charts) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const existingChartIds = new Set(group.charts.map(c => `${c.title}-${c.mode}-${c.difficulty}`));
    const newCharts = charts.filter(c => !existingChartIds.has(`${c.title}-${c.mode}-${c.difficulty}`));
    updateGroup(id, { songs: [...group.charts, ...newCharts] });
  };

  const addChartToGroup = (id, chart) => {
    console.log(`Context: addChartToGroup called with id: ${id}`);
    const group = groups.find(g => g.id === id);
    if (!group) {
        console.error("Context: Group not found in state for id:", id);
        return;
    }
    const isExisting = group.charts.some(c => c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty);
    if (!isExisting) {
      const updatedSongs = [...group.charts, chart];
      console.log("Context: Updating group with new songs:", updatedSongs);
      updateGroup(id, { songs: updatedSongs });
    } else {
        console.log("Context: Chart already exists in the group.");
    }
  };

  const removeChartFromGroup = (id, chart) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const updatedSongs = group.charts.filter(c => !(c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty));
    updateGroup(id, { songs: updatedSongs });
  };

  const updateChartDifficulty = (id, chart, newDiff) => {
    const group = groups.find(g => g.id === id);
    if (!group) return;
    const updatedSongs = group.charts.map(c =>
      c.title === chart.title && c.mode === chart.mode && c.difficulty === chart.difficulty
        ? { ...c, difficulty: newDiff.difficulty.toLowerCase(), level: newDiff.feet }
        : c
    );
    updateGroup(id, { songs: updatedSongs });
  };

  return (
    <GroupsContext.Provider value={{
      groups,
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