/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useContext } from 'react';

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
    const savedFilters = localStorage.getItem('filters');
    if (savedFilters) {
      const parsed = JSON.parse(savedFilters);
      // Ensure all keys from defaultFilters are present
      return { ...defaultFilters, ...parsed };
    }
    return defaultFilters;
  });

  useEffect(() => {
    localStorage.setItem('filters', JSON.stringify(filters));
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

