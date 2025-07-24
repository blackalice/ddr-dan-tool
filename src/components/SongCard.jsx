import React, { useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { useScores } from '../contexts/ScoresContext.jsx';
import { getGrade } from '../utils/grades.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPen } from '@fortawesome/free-solid-svg-icons';
import './SongCard.css';

const difficultyDisplayMap = {
    single: {
        beginner: { name: "bSP", color: "#4DB6AC", textColor: "#000000" },
        basic: { name: "BSP", color: "#f8d45a", textColor: "#000000" },
        difficult: { name: "DSP", color: "#d4504e", textColor: "#ffffff" },
        expert: { name: "ESP", color: "#6fbe44", textColor: "#ffffff" },
        challenge: { name: "CSP", color: "#c846a6", textColor: "#ffffff" },
    },
    double: {
        beginner: { name: "bDP", color: "#4DB6AC", textColor: "#000000" },
        basic: { name: "BDP", color: "#f8d45a", textColor: "#000000" },
        difficult: { name: "DDP", color: "#d4504e", textColor: "#ffffff" },
        expert: { name: "EDP", color: "#6fbe44", textColor: "#ffffff" },
        challenge: { name: "CDP", color: "#c846a6", textColor: "#ffffff" },
    }
};

const getBpmRange = (bpm) => {
  if (typeof bpm !== 'string') return { min: 0, max: 0 };
  const parts = bpm.split('-').map(Number);
  if (parts.length === 1) {
    return { min: parts[0], max: parts[0] };
  }
  return { min: Math.min(...parts), max: Math.max(...parts) };
};

const renderLevel = (level) => {
    const hasDecimal = typeof level === 'number' && level % 1 !== 0;
    if (!hasDecimal) {
        return `Lv.${level}`;
    }

    const levelStr = level.toString();
    const decimalIndex = levelStr.indexOf('.');
    const integerPart = levelStr.substring(0, decimalIndex);
    const decimalPart = levelStr.substring(decimalIndex);

    return (
        <>
            Lv.{integerPart}
            <span className="decimal-part">{decimalPart}</span>
        </>
    );
};

const SongCard = ({ song, resetFilters, onRemove, onEdit, highlight = false, score, scoreHighlight = false, forceShowRankedRating = false }) => {
  const { targetBPM, multipliers, setPlayStyle, showRankedRatings } = useContext(SettingsContext);
  const { scores } = useScores();
  const navigate = useNavigate();

  const scoreData = React.useMemo(() => {
    if (!song || !song.title || !song.difficulty || !song.mode) return null;
    const key = `${song.title.toLowerCase()}-${song.difficulty.toLowerCase()}`;
    return scores[song.mode]?.[key] || null;
  }, [scores, song]);

  const displayScore = scoreData?.score ?? score ?? null;
  const lamp = scoreData?.lamp ?? null;
  const flare = scoreData?.flare ?? null;
  const grade = React.useMemo(() => getGrade(displayScore), [displayScore]);

  const hasScores = React.useMemo(
    () =>
      Object.keys(scores.single || {}).length > 0 ||
      Object.keys(scores.double || {}).length > 0,
    [scores]
  );
  const showSlice = hasScores;

  const calculation = useMemo(() => {
    if (song.error) return { modifier: 'N/A', minSpeed: 'N/A', maxSpeed: 'N/A', isRange: false };
    
    const numericTarget = Number(targetBPM) || 0;
    const bpmRange = getBpmRange(song.bpm);
    
    if (bpmRange.max === 0) return { modifier: 'N/A', minSpeed: 'N/A', maxSpeed: 'N/A', isRange: false };

    const idealMultiplier = numericTarget / bpmRange.max;
    const closestMultiplier = multipliers.reduce((prev, curr) => 
      Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
    );

    const minSpeed = (bpmRange.min * closestMultiplier).toFixed(0);
    const maxSpeed = (bpmRange.max * closestMultiplier).toFixed(0);

    return {
      modifier: closestMultiplier,
      minSpeed: minSpeed,
      maxSpeed: maxSpeed,
      isRange: bpmRange.min !== bpmRange.max
    };
  }, [song.bpm, targetBPM, multipliers, song.error]);

  const difficultyInfo = song.mode && song.difficulty ? difficultyDisplayMap[song.mode]?.[song.difficulty] : null;

  if (song.error) {
    return (
      <div className="song-card-link">
        <div className="song-card error-card">
          <div className="song-card-header">
            <h3 className="song-title">{song.title}</h3>
          </div>
          <div className="song-details">
            <p className="error-message">{song.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const showRanked = forceShowRankedRating || showRankedRatings;
  const levelToDisplay = showRanked && song.rankedRating != null ? song.rankedRating : song.level;

  return (
    <div
      className={
        'song-card-link' + (scoreHighlight ? ' score-highlight' : '')
      }
      onClick={() => {
      if (resetFilters) resetFilters();
      if (setPlayStyle) setPlayStyle(song.mode);
      navigate(
        `/bpm?difficulty=${song.difficulty}&mode=${song.mode}#${encodeURIComponent(song.title)}`,
        { state: { fromSongCard: true } }
      );
    }}>
      <div
        className={
          'song-card' +
          (highlight ? ' highlight' : '') +
          (showSlice ? ' with-score-slice' : '')
        }
      >
        {onEdit && (
          <button className="song-card-action edit" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <FontAwesomeIcon icon={faPen} />
          </button>
        )}
        {onRemove && (
          <button className="song-card-action remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        )}
        <div className="song-card-header">
          <h3 className="song-title">{song.title}</h3>
          <div className="header-right">
            {song.game && <div className="game-chip">{song.game}</div>}
          </div>
        </div>
        <div className="song-details">
          <div>
            <span className="song-bpm">BPM: {song.bpm}</span>
            <div className="song-calculation">
              <span className="song-speed">
                {calculation.isRange ? `${calculation.minSpeed}-${calculation.maxSpeed}` : calculation.maxSpeed}
              </span>
              <span className="song-separator">@</span>
              <span className="song-modifier">{calculation.modifier}x</span>
            </div>
          </div>
          <div className="song-level-container">
              <span className="song-level">{renderLevel(levelToDisplay)}</span>
              {difficultyInfo && (
                   <span 
                      className="difficulty-badge"
                      style={{ backgroundColor: difficultyInfo.color, color: difficultyInfo.textColor }}
                  >
                      {difficultyInfo.name}
                  </span>
              )}
          </div>
        </div>
      </div>
      {showSlice && (
        <div className="song-score-slice">
          <span className="score-value">
            {displayScore != null ? displayScore.toLocaleString() : '0,000,000'}
          </span>
          <span className="score-extra">
            {displayScore != null
              ? `${grade}${lamp ? ` - ${lamp}` : ''}${flare ? ` ${flare}` : ''}`
              : 'No score'}
          </span>
        </div>
      )}
    </div>
  );
};

export default SongCard;
