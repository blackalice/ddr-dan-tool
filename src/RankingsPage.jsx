import React, { useState, useEffect, useContext, useMemo } from 'react';
import SongCard from './components/SongCard.jsx';
import RankingsSettingsModal from './components/RankingsSettingsModal.jsx';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDownWideShort, faArrowUpWideShort, faCircleExclamation, faGear } from '@fortawesome/free-solid-svg-icons';
import { SONGLIST_OVERRIDE_OPTIONS } from './utils/songlistOverrides';
import { normalizeString } from './utils/stringSimilarity.js';
import { storage } from './utils/remoteStorage.js';
import './App.css';
import './VegaPage.css';
import './ListsPage.css';
import { getSongMeta, getJsonCached } from './utils/cachedFetch.js';
import { resolveScore } from './utils/scoreKey.js';

const CLOSE_FILTER_DEFAULT = { min: 980000, max: 989999 };
const SCORE_FORMATTER = new Intl.NumberFormat('en-US');

const loadCloseRange = () => {
  try {
    const stored = storage.getItem('rankingsCloseRange');
    if (!stored) return { ...CLOSE_FILTER_DEFAULT };
    const parsed = JSON.parse(stored);
    const min = Math.round(Number(parsed?.min));
    const max = Math.round(Number(parsed?.max));
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return { min, max };
    }
  } catch (_e) {
    void _e;
  }
  return { ...CLOSE_FILTER_DEFAULT };
};

const RatingSection = ({ rating, charts, collapsed, onToggle }) => {
  return (
    <section className="dan-section">
      <h2 className={`dan-header ${collapsed ? 'is-collapsed' : ''}`} style={{ backgroundColor: 'var(--accent-color)' }}>
        <div className="dan-header-title">Lv.{rating.toFixed(2)}</div>
        <button className="collapse-button" onClick={() => onToggle(rating)}>
          <i className={`fa-solid ${collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
        </button>
      </h2>
      {!collapsed && (
        <div className="song-grid">
          {charts.map((chart, idx) => (
            <SongCard
              key={idx}
              song={chart}
              score={chart.score}
              scoreHighlight={chart.score > 989999}
              forceShowRankedRating
            />
          ))}
        </div>
      )}
    </section>
  );
};

const RankingsPage = () => {
  const { playStyle, songlistOverride } = useContext(SettingsContext);
  const { resetFilters } = useFilters();
  const { scores } = useScores();
  const [songMeta, setSongMeta] = useState([]);
  const [overrideSongs, setOverrideSongs] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(() => {
    const stored = storage.getItem('selectedRankingLevel');
    return stored ? Number(stored) : null;
  });
  const [ascendingOrder, setAscendingOrder] = useState(() => {
    const stored = storage.getItem('rankingsAscending');
    return stored ? JSON.parse(stored) : false;
  });
  const [hideTopScores, setHideTopScores] = useState(() => {
    const stored = storage.getItem('rankingsHideTop');
    return stored ? JSON.parse(stored) : false;
  });
  const [closeOnly, setCloseOnly] = useState(() => {
    const stored = storage.getItem('rankingsCloseOnly');
    return stored ? JSON.parse(stored) : false;
  });
  const [closeRange, setCloseRange] = useState(() => loadCloseRange());
  const normalizedCloseRange = useMemo(() => {
    const min = Number.isFinite(closeRange?.min) ? closeRange.min : CLOSE_FILTER_DEFAULT.min;
    const max = Number.isFinite(closeRange?.max) ? closeRange.max : CLOSE_FILTER_DEFAULT.max;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }, [closeRange]);

  const closeRangeLabel = useMemo(() => {
    const { min, max } = normalizedCloseRange;
    return SCORE_FORMATTER.format(min) + '-' + SCORE_FORMATTER.format(max);
  }, [normalizedCloseRange]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleCloseRangeSave = (range) => {
    const parseScore = (value, fallback) => {
      const numeric = Math.round(Number(value));
      return Number.isNaN(numeric) ? fallback : numeric;
    };
    const minValue = parseScore(range?.min, CLOSE_FILTER_DEFAULT.min);
    const maxValue = parseScore(range?.max, CLOSE_FILTER_DEFAULT.max);
    setCloseRange(prev => {
      if (prev?.min === minValue && prev?.max === maxValue) {
        return prev;
      }
      return { min: minValue, max: maxValue };
    });
  };


  useEffect(() => {
    getSongMeta()
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
    if (availableLevels.length === 0) return;
    if (selectedLevel == null) {
      const stored = storage.getItem('selectedRankingLevel');
      const level = stored ? Number(stored) : availableLevels[0];
      setSelectedLevel(availableLevels.includes(level) ? level : availableLevels[0]);
    } else if (!availableLevels.includes(selectedLevel)) {
      setSelectedLevel(availableLevels[0]);
    }
  }, [availableLevels, selectedLevel]);

  useEffect(() => {
    if (selectedLevel != null) {
      storage.setItem('selectedRankingLevel', selectedLevel);
    }
  }, [selectedLevel]);

  useEffect(() => {
    storage.setItem('rankingsAscending', JSON.stringify(ascendingOrder));
  }, [ascendingOrder]);
  useEffect(() => {
    storage.setItem('rankingsHideTop', JSON.stringify(hideTopScores));
  }, [hideTopScores]);
  useEffect(() => {
    storage.setItem('rankingsCloseOnly', JSON.stringify(closeOnly));
  }, [closeOnly]);
  useEffect(() => {
    storage.setItem('rankingsCloseRange', JSON.stringify(normalizedCloseRange));
  }, [normalizedCloseRange]);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(storage.getItem('rankingsCollapsed')) || {};
    } catch {
      return {};
    }
  });

  const toggleCollapse = (rating) => {
    setCollapsed(prev => {
      const newState = { ...prev, [rating]: !prev[rating] };
      storage.setItem('rankingsCollapsed', JSON.stringify(newState));
      return newState;
    });
  };

  useEffect(() => {
    const option = SONGLIST_OVERRIDE_OPTIONS.find(o => o.value === songlistOverride);
    if (!option || !option.file) {
      setOverrideSongs(null);
      return;
    }
    getJsonCached(option.file)
      .then(data => {
        const songs = (data.songs || []).map(normalizeString);
        setOverrideSongs(new Set(songs));
      })
      .catch(err => { console.error('Failed to load songlist override:', err); setOverrideSongs(null); });
  }, [songlistOverride]);

  const chartsForLevel = useMemo(() => {
    const charts = [];
    for (const song of songMeta) {
      for (const diff of song.difficulties) {
        if (
          diff.mode === playStyle &&
          diff.rankedRating != null &&
          Math.floor(diff.rankedRating) === selectedLevel
        ) {
          if (overrideSongs && overrideSongs.size > 0) {
            const titles = [song.title];
            if (song.titleTranslit) titles.push(song.titleTranslit);
            const normalized = titles.map(normalizeString);
            if (!normalized.some(t => overrideSongs.has(t))) continue;
          }
          const bpm = song.hasMultipleBpms ? `${Math.round(song.bpmMin)}-${Math.round(song.bpmMax)}` : String(Math.round(song.bpmMin));
          const chart = {
            title: song.title,
            bpm,
            level: diff.feet,
            difficulty: diff.difficulty,
            mode: diff.mode,
            game: song.game,
            artist: song.artist,
            rankedRating: diff.rankedRating,
            resetFilters,
            path: song.path,
            slug: `${diff.mode}-${String(diff.difficulty).toLowerCase()}`,
            chartId: diff.chartId,
            songId: song.id,
          };
          const hit = resolveScore(scores, diff.mode, {
            chartId: diff.chartId,
            songId: song.id,
            title: song.title,
            artist: song.artist,
            difficulty: diff.difficulty,
          });
          if (hit) {
            chart.score = hit.score;
          }
          charts.push(chart);
        }
      }
    }
    return charts;
  }, [songMeta, playStyle, selectedLevel, resetFilters, scores, overrideSongs]);

  const groupedCharts = useMemo(() => {
    let visibleCharts = hideTopScores
      ? chartsForLevel.filter(c => !(c.score > 989999))
      : chartsForLevel;
    if (closeOnly) {
      const { min, max } = normalizedCloseRange;
      visibleCharts = visibleCharts.filter(c => c.score != null && c.score >= min && c.score <= max);
    }
    const map = new Map();
    for (const chart of visibleCharts) {
      const ratingKey = Math.round(chart.rankedRating * 20) / 20; // 0.05 steps
      if (!map.has(ratingKey)) map.set(ratingKey, []);
      map.get(ratingKey).push(chart);
    }
    const keys = Array.from(map.keys()).sort((a, b) =>
      ascendingOrder ? a - b : b - a
    );
    return keys.map(k => ({ rating: k, charts: map.get(k) }));
  }, [chartsForLevel, ascendingOrder, hideTopScores, closeOnly, normalizedCloseRange]);

  const hasScores = useMemo(() => {
    return (
      Object.keys(scores.single || {}).length > 0 ||
      Object.keys(scores.double || {}).length > 0
    );
  }, [scores]);

  const topCount = useMemo(
    () => chartsForLevel.filter((c) => c.score > 989999).length,
    [chartsForLevel]
  );

  const topPercent = useMemo(() => {
    if (chartsForLevel.length === 0) return 0;
    return ((topCount / chartsForLevel.length) * 100).toFixed(1);
  }, [topCount, chartsForLevel.length]);

  if (!selectedLevel) return null;

  return (
    <div className="app-container rankings-page">
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
          <button
            className="filter-button"
            onClick={() => setAscendingOrder(a => !a)}
            title="Flip order"
          >
            <FontAwesomeIcon icon={ascendingOrder ? faArrowUpWideShort : faArrowDownWideShort} />
          </button>
          <button
            className={`filter-button ${hideTopScores ? 'active' : ''}`}
            onClick={() => setHideTopScores(h => !h)}
            title={hideTopScores ? 'Show cleared (>989,999)' : 'Hide cleared (>989,999)'}
            aria-pressed={hideTopScores}
          >
            <span className="aaa-icon" aria-hidden="true">AAA</span>
          </button>
          <button
            className={`filter-button ${closeOnly ? 'active' : ''}`}
            onClick={() => setCloseOnly(c => !c)}
            title={closeOnly ? 'Show all scores' : 'Filter close (' + closeRangeLabel + ')'}
            aria-pressed={closeOnly}
          >
            <FontAwesomeIcon icon={faCircleExclamation} />
          </button>
          <button
            className="filter-button"
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Open rankings settings"
            aria-label="Open rankings settings"
            aria-haspopup="dialog"
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
          {hasScores && (
            <div className="ranking-counter">
              {topCount}/{chartsForLevel.length} ({topPercent}%)
            </div>
          )}
        </div>
      </div>
      {groupedCharts.map(group => (
          <RatingSection
            key={group.rating}
            rating={group.rating}
            charts={group.charts}
            collapsed={!!collapsed[group.rating]}
            onToggle={toggleCollapse}
          />
      ))}
      </main>
      <RankingsSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        closeRange={normalizedCloseRange}
        defaultCloseRange={CLOSE_FILTER_DEFAULT}
        onApply={handleCloseRangeSave}
      />
    </div>
  );
};

export default RankingsPage;
