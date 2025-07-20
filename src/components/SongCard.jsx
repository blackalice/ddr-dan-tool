import React, { useMemo, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
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

const SongCard = ({ song, resetFilters, onRemove, onEdit, highlight = false, forceShowRankedRating = false }) => {
  const { targetBPM, multipliers, setPlayStyle, showRankedRatings } = useContext(SettingsContext);
  const navigate = useNavigate();

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

  return (
    <div className="song-card-link" onClick={() => {
      if (resetFilters) resetFilters();
      if (setPlayStyle) setPlayStyle(song.mode);
      navigate(
        `/bpm?difficulty=${song.difficulty}&mode=${song.mode}#${encodeURIComponent(song.title)}`,
        { state: { fromSongCard: true } }
      );
    }}>
      <div className={`song-card${highlight ? ' highlight' : ''}`}>
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
          {song.game && <div className="game-chip">{song.game}</div>}
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
              <span className="song-level">Lv.{showRanked && song.rankedRating ? song.rankedRating.toFixed(1) : song.level}</span>
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
    </div>
  );
};

export default SongCard;
