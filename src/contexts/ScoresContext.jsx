/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '../utils/remoteStorage.js';

export const ScoresContext = createContext();

export const ScoresProvider = ({ children }) => {
  const [scores, setScores] = useState(() => {
    const saved = storage.getItem('ddrScores');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old flat structure to new playstyle-separated format
      if (!parsed.single && !parsed.double) {
        return { single: parsed, double: {} };
      }
      return parsed;
    }
    return { single: {}, double: {} };
  });

  useEffect(() => {
    storage.setItem('ddrScores', JSON.stringify(scores));
  }, [scores]);

  return (
    <ScoresContext.Provider value={{ scores, setScores }}>
      {children}
    </ScoresContext.Provider>
  );
};

export const useScores = () => useContext(ScoresContext);
