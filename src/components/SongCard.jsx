import React, { useMemo, useContext } from 'react';
import { resolveScore } from '../utils/scoreKey.js';
import { getSongMeta } from '../utils/cachedFetch.js';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { useScores } from '../contexts/ScoresContext.jsx';
import { getGrade } from '../utils/grades.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPen, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import './SongCard.css';
import '../styles/glow.css';
import { GAME_CHIP_STYLES } from '../utils/gameChipStyles.js';
import { getScoreGlowClasses } from '../utils/scoreHighlight.js';

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

const SongCard = ({ song, resetFilters, onRemove, onEdit, highlight = false, score, scoreHighlight = false, forceShowRankedRating = false, dragAttributes = {}, dragListeners = {}, showDragHandle = false, skipScoreLookup = false, bpmOnly = false, showArtist = false, showJacket = false, jacketFull = false, showGameWithDifficulty = false, levelInTitleBlock = false }) => {
  const { targetBPM, multipliers, setPlayStyle, showRankedRatings } = useContext(SettingsContext);
  const { scores } = useScores();
  const navigate = useNavigate();
  const [derivedArtist, setDerivedArtist] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function derive() {
      if (song?.artist || !song?.path) { setDerivedArtist(null); return; }
      try {
        const meta = await getSongMeta();
        const m = meta.find(x => x.path === song.path);
        if (!cancelled) setDerivedArtist(m?.artist || null);
      } catch {
        if (!cancelled) setDerivedArtist(null);
      }
    }
    derive();
    return () => { cancelled = true; };
  }, [song?.artist, song?.path]);

  const scoreData = React.useMemo(() => {
    if (skipScoreLookup) return null;
    if (!song || !song.difficulty || !song.mode) return null;
    const artist = song.artist || derivedArtist || undefined;
    return resolveScore(scores, song.mode, {
      chartId: song.chartId,
      songId: song.songId || song.id,
      title: song.title,
      artist,
      difficulty: song.difficulty,
    });
  }, [skipScoreLookup, scores, song, derivedArtist]);

  const displayScore = scoreData?.score ?? score ?? null;
  const lamp = scoreData?.lamp ?? song?.lamp ?? null;
  const flare = scoreData?.flare ?? null;
  const grade = React.useMemo(() => getGrade(displayScore), [displayScore]);
  const artistName = song?.artist || derivedArtist || "";
  const jacketPath = song?.jacket || "";

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

  const showRanked = forceShowRankedRating || showRankedRatings;
  const levelToDisplay = showRanked && song.rankedRating != null ? song.rankedRating : song.level;

  const cardLinkClassName = useMemo(() => {
    const classes = ['song-card-link'];
    if (!song?.error && scoreHighlight) {
      classes.push('score-highlight');
      const glow = getScoreGlowClasses({ lamp });
      if (glow) classes.push(glow);
    }
    return classes.join(' ');
  }, [song?.error, scoreHighlight, lamp]);

  if (song.error) {
    return (
      <div className={cardLinkClassName}>
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

  return (
    <div
      className={cardLinkClassName}
      onClick={() => {
      if (resetFilters) resetFilters();
      if (setPlayStyle) setPlayStyle(song.mode);
      const songId = song.songId || song.id || song.path || song.value;
      const chartId = song.chartId || song.slug; // may be undefined in Dan/Vega data
      if (songId) {
        const params = new URLSearchParams();
        params.set('song', songId);
        if (chartId) params.set('chart', chartId);
        const query = params.toString();
        navigate(`/bpm${query ? `?${query}` : ''}`, { state: { fromSongCard: true } });
      } else {
        // Fallback to legacy via query param 't' (title) plus mode/difficulty
        navigate(`/bpm?mode=${encodeURIComponent(song.mode)}&difficulty=${encodeURIComponent(song.difficulty)}&t=${encodeURIComponent(song.title)}`, { state: { fromSongCard: true, title: song.title } });
      }
    }}>
      <div
        className={
          'song-card' +
          (highlight ? ' highlight' : '') +
          (showSlice ? ' with-score-slice' : '') +
          (bpmOnly ? ' bpm-only' : '') +
          (showArtist ? ' show-artist' : '') +
          (showJacket ? ' show-jacket' : '') +
          (jacketFull ? ' jacket-full' : '') +
          (showGameWithDifficulty ? ' show-game-with-difficulty' : '')
        }
      >
        {showJacket && jacketPath && (
          <>
            <div
              className="song-card-jacket-bg"
              style={{ backgroundImage: `url("/${encodeURI(jacketPath)}")` }}
            />
            <div className="song-card-jacket-fade" />
          </>
        )}
        {showDragHandle && (
          <button
            className="song-card-action drag"
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
            aria-label="Drag to reorder"
            {...dragAttributes}
            {...dragListeners}
          >
            <FontAwesomeIcon icon={faGripVertical} />
          </button>
        )}
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
          <div className="song-title-block">
            <h3 className="song-title">{song.title}</h3>
            {showArtist && artistName && (
              <span className="song-card-artist" title={artistName}>
                {artistName}
              </span>
            )}
            {levelInTitleBlock && (
              <span className="song-level song-title-level">
                {renderLevel(levelToDisplay)}
              </span>
            )}
          </div>
          <div className="header-right">
            {song.game && (
              <div className="game-chip" style={GAME_CHIP_STYLES[song.game] || GAME_CHIP_STYLES.DEFAULT}>
                {song.game}
              </div>
            )}
          </div>
        </div>
        <div className="song-details">
          <div>
            <span className="song-bpm">BPM: {song.bpm}</span>
            {!bpmOnly && (
              <div className="song-calculation">
                <span className="song-speed">
                  {calculation.isRange ? `${calculation.minSpeed}-${calculation.maxSpeed}` : calculation.maxSpeed}
                </span>
                <span className="song-separator">@</span>
                <span className="song-modifier">{calculation.modifier}x</span>
              </div>
            )}
          </div>
          <div className="song-level-container">
              <span
                className={`song-level${levelInTitleBlock ? " song-inline-level" : ""}`}
              >
                {renderLevel(levelToDisplay)}
              </span>
              <div className="song-badges">
                {difficultyInfo && (
                  <span
                    className="difficulty-badge"
                    style={{ backgroundColor: difficultyInfo.color, color: difficultyInfo.textColor }}
                  >
                    {difficultyInfo.name}
                  </span>
                )}
                {showGameWithDifficulty && song.game && (
                  <span
                    className="game-chip inline"
                    style={GAME_CHIP_STYLES[song.game] || GAME_CHIP_STYLES.DEFAULT}
                  >
                    {song.game}
                  </span>
                )}
              </div>
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
