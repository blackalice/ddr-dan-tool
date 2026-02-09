/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useContext } from 'react';
import { storage } from '../utils/remoteStorage.js';
import { ADVANCED_FILTER_DEFAULTS } from '../utils/advancedStatsFilters.js';

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
  rankedFractionMin: '',
  rankedFractionMax: '',
  ...ADVANCED_FILTER_DEFAULTS,
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
        const migrated = { ...defaultFilters, ...parsed, games: migratedGames };
        const hasFractionMin = Object.prototype.hasOwnProperty.call(parsed, 'rankedFractionMin');
        const hasFractionMax = Object.prototype.hasOwnProperty.call(parsed, 'rankedFractionMax');
        if (!hasFractionMin && !hasFractionMax && parsed.rankedCap != null) {
          migrated.rankedFractionMin = '';
          migrated.rankedFractionMax = parsed.rankedCap;
        }
        return migrated;
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

