import React, { useState, useEffect, useContext, useMemo } from 'react';
import SongCard from './components/SongCard.jsx';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import './App.css';
import './VegaPage.css';

const RatingSection = ({ rating, charts }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  return (
    <section className="dan-section">
      <h2 className={`dan-header ${isCollapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: 'var(--accent-color)' }}>
        <div className="dan-header-title">Lv.{rating.toFixed(2)}</div>
        <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
        </button>
      </h2>
      {!isCollapsed && (
        <div className="song-grid">
          {charts.map((chart, idx) => (
            <SongCard key={idx} song={chart} />
          ))}
        </div>
      )}
    </section>
  );
};

const RankingsPage = () => {
  const { playStyle } = useContext(SettingsContext);
  const { resetFilters } = useFilters();
  const [songMeta, setSongMeta] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(null);

  useEffect(() => {
    fetch('/song-meta.json')
      .then(res => res.json())
      .then(setSongMeta)
      .catch(err => console.error('Failed to load song meta:', err));
  }, []);

  const availableLevels = useMemo(() => {
    const levels = new Set();
    for (const song of songMeta) {
      for (const diff of song.difficulties) {
        if (diff.mode === playStyle && diff.rankedRating != null) {
          levels.add(Math.floor(diff.rankedRating));
        }
      }
    }
    return Array.from(levels).sort((a, b) => a - b);
  }, [songMeta, playStyle]);

  useEffect(() => {
    if (availableLevels.length > 0 && !availableLevels.includes(selectedLevel)) {
      setSelectedLevel(availableLevels[0]);
    }
  }, [availableLevels, selectedLevel]);

  const chartsForLevel = useMemo(() => {
    const charts = [];
    for (const song of songMeta) {
      for (const diff of song.difficulties) {
        if (
          diff.mode === playStyle &&
          diff.rankedRating != null &&
          Math.floor(diff.rankedRating) === selectedLevel
        ) {
          const bpm = song.hasMultipleBpms ? `${Math.round(song.bpmMin)}-${Math.round(song.bpmMax)}` : String(Math.round(song.bpmMin));
          charts.push({
            title: song.title,
            bpm,
            level: diff.feet,
            difficulty: diff.difficulty,
            mode: diff.mode,
            game: song.game,
            rankedRating: diff.rankedRating,
            resetFilters,
          });
        }
      }
    }
    return charts;
  }, [songMeta, playStyle, selectedLevel, resetFilters]);

  const groupedCharts = useMemo(() => {
    const map = new Map();
    for (const chart of chartsForLevel) {
      const ratingKey = Math.round(chart.rankedRating * 20) / 20; // 0.05 steps
      if (!map.has(ratingKey)) map.set(ratingKey, []);
      map.get(ratingKey).push(chart);
    }
    const keys = Array.from(map.keys()).sort((a, b) => b - a);
    return keys.map(k => ({ rating: k, charts: map.get(k) }));
  }, [chartsForLevel]);

  if (!selectedLevel) return null;

  return (
    <div className="app-container">
      <main>
        <div className="filter-bar">
          <div className="filter-group list-page-filter-group">
            <div className="dan-select-wrapper">
              <select value={selectedLevel} onChange={e => setSelectedLevel(Number(e.target.value))} className="dan-select">
                {availableLevels.map(level => (
                  <option key={level} value={level}>Level {level}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {groupedCharts.map(group => (
          <RatingSection key={group.rating} rating={group.rating} charts={group.charts} />
        ))}
      </main>
    </div>
  );
};

export default RankingsPage;
