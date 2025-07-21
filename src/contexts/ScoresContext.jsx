/* eslint react-refresh/only-export-components: off */
import React, { createContext, useContext, useState, useEffect } from 'react';

export const ScoresContext = createContext();

export const ScoresProvider = ({ children }) => {
  const [scores, setScores] = useState(() => {
    const saved = localStorage.getItem('ddrScores');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('ddrScores', JSON.stringify(scores));
  }, [scores]);

  return (
    <ScoresContext.Provider value={{ scores, setScores }}>
      {children}
    </ScoresContext.Provider>
  );
};

export const useScores = () => useContext(ScoresContext);
