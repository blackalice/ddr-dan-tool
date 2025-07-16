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
  multiBpm: 'any', // 'any' | 'single' | 'multiple'
};

export const FilterContext = createContext({
  filters: defaultFilters,
  setFilters: () => {},
  resetFilters: () => {},
});

export const FilterProvider = ({ children }) => {
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('filters');
    return saved ? JSON.parse(saved) : defaultFilters;
  });

  useEffect(() => {
    localStorage.setItem('filters', JSON.stringify(filters));
  }, [filters]);

  const resetFilters = () => setFilters(defaultFilters);
  return (
    <FilterContext.Provider value={{ filters, setFilters, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilters = () => useContext(FilterContext);

