import React, { createContext, useState, useContext } from 'react';

const defaultFilters = {
  bpmMin: '',
  bpmMax: '',
  difficultyMin: '',
  difficultyMax: '',
  games: [],
  artist: '',
  multiBpm: 'any', // 'any' | 'single' | 'multiple'
};

export const FilterContext = createContext({
  filters: defaultFilters,
  setFilters: () => {},
  resetFilters: () => {},
});

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState(defaultFilters);
  const resetFilters = () => setFilters(defaultFilters);
  return (
    <FilterContext.Provider value={{ filters, setFilters, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => useContext(FilterContext);

