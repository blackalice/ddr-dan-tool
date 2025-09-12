/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { storage } from '../utils/remoteStorage.js';

const defaultFilters = {
  bpmMin: '',
  bpmMax: '',
  difficultyMin: '',
  difficultyMax: '',
  lengthMin: '',
  lengthMax: '',
  games: [],
  artist: '',
  title: '',
  multiBpm: 'any',
  playedStatus: 'all',
  difficultyNames: [],
};

export const FilterContext = createContext({
  filters: defaultFilters,
  updateFilter: () => {},
  resetFilters: () => {},
});

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState(() => {
    const saved = storage.getItem('filters');
    if (saved) {
      try {
        const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
        // Migrate renamed game folders (e.g., "+" -> "Plus")
        const gameRenames = {
          '4th+': '4th Plus',
          'A20+': 'A20 Plus',
        };
        const migratedGames = Array.isArray(parsed.games)
          ? parsed.games.map(g => gameRenames[g] || g)
          : [];
        return { ...defaultFilters, ...parsed, games: migratedGames };
      } catch {
        // If bad data, fall back to defaults
        return defaultFilters;
      }
    }
    return defaultFilters;
  });

  useEffect(() => {
    storage.setItem('filters', JSON.stringify(filters));
  }, [filters]);

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return (
    <FilterContext.Provider value={{ filters, setFilters, updateFilter, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => useContext(FilterContext);

