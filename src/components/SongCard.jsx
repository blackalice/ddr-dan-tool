import React, { useMemo, useContext } from 'react';
import { resolveScore } from '../utils/scoreKey.js';
import { getSongMeta } from '../utils/cachedFetch.js';
import { useNavigate } from 'react-router-dom';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { useScores } from '../contexts/ScoresContext.jsx';
import { getGrade } from '../utils/grades.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faTimes, faPen, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import './SongCard.css';
import '../styles/glow.css';
import { GAME_CHIP_STYLES } from '../utils/gameChipStyles.js';
import { getScoreGlowClasses } from '../utils/scoreHighlight.js';
import { formatRankedRating } from '../utils/formatRankedRating.js';
import GameLogo from './GameLogo.jsx';

let songMetaByPathPromise;

const getSongMetaByPath = () => {
  if (!songMetaByPathPromise) {
    songMetaByPathPromise = getSongMeta().then(
      (meta) => new Map(meta.map((entry) => [entry.path, entry])),
      (error) => {
        songMetaByPathPromise = null;
        throw error;
      },
    );
  }
  return songMetaByPathPromise;
};

const difficultyDisplayMap = {
    single: {
        beginner: { name: "bSP", color: "#4DB6AC", textColor: "#000000" },
        basic: { name: "BSP", color: "#f8d45a", textColor: "#000000" },
        difficult: { name: "DSP", color: "#d4504e", textColor: "#ffffff" },
        expert: { name: "ESP", color: "#6fbe44", textColor: "#000000" },
        challenge: { name: "CSP", color: "#c846a6", textColor: "#ffffff" },
    },
    double: {
        beginner: { name: "bDP", color: "#4DB6AC", textColor: "#000000" },
        basic: { name: "BDP", color: "#f8d45a", textColor: "#000000" },
        difficult: { name: "DDP", color: "#d4504e", textColor: "#ffffff" },
        expert: { name: "EDP", color: "#6fbe44", textColor: "#000000" },
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

const renderLevel = (level, showShock) => {
    if (level == null) return null;
    const levelStr = String(level);
    const decimalIndex = levelStr.indexOf('.');
    const hasDecimal = decimalIndex !== -1;
    let levelNode;
    if (!hasDecimal) {
        levelNode = `Lv.${levelStr}`;
    } else {
        const integerPart = levelStr.substring(0, decimalIndex);
        const decimalPart = levelStr.substring(decimalIndex);

        levelNode = (
            <>
                Lv.{integerPart}
                <span className="decimal-part">{decimalPart}</span>
            </>
        );
    }
    return (
        <>
            {levelNode}
            {showShock && (
              <FontAwesomeIcon
                icon={faBolt}
                className="song-level-shock"
                title="Shock arrows"
              />
            )}
        </>
    );
};

const formatLevelText = (level) => {
  if (level == null) return "";
  if (typeof level === "number") {
    return Number.isInteger(level) ? String(level) : level.toString();
  }
  return String(level);
};

const SongCard = ({ song, resetFilters, onRemove, onEdit, highlight = false, score, scoreHighlight = false, forceShowRankedRating = false, dragAttributes = {}, dragListeners = {}, showDragHandle = false, skipScoreLookup = false, bpmOnly = false, showArtist = false, showJacket = false, jacketFull = false, showGameLogo = false, showGameWithDifficulty = false, levelInTitleBlock = false, onCardClick, cardTag = null, showScoreSlice = false, scoreSliceLeft = null, scoreSliceRight = null, scoreSliceClassName = "" }) => {
  const { targetBPM, multipliers, setPlayStyle, showRankedRatings, showTransliterationBeta } = useContext(SettingsContext);
  const { scores, hasScores } = useScores();
  const navigate = useNavigate();
  const [derivedArtist, setDerivedArtist] = React.useState(null);
  const [derivedTitleTranslit, setDerivedTitleTranslit] = React.useState(null);
  const [derivedArtistTranslit, setDerivedArtistTranslit] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    async function derive() {
      const needsArtist = !song?.artist && song?.path;
      const needsTitleTranslit = Boolean(showTransliterationBeta && song?.path && !song?.titleTranslit);
      const needsArtistTranslit = Boolean(showTransliterationBeta && showArtist && song?.path && !song?.artistTranslit);
      const needsTranslit = needsTitleTranslit || needsArtistTranslit;
      if (!needsArtist && !needsTranslit) {
        if (!needsArtist) setDerivedArtist(null);
        if (!needsTranslit) {
          setDerivedTitleTranslit(null);
          setDerivedArtistTranslit(null);
        }
        return;
      }
      try {
        const metaByPath = await getSongMetaByPath();
        const m = metaByPath.get(song.path);
        if (cancelled) return;
        if (needsArtist) setDerivedArtist(m?.artist || null);
        if (needsTranslit) {
          if (needsTitleTranslit) setDerivedTitleTranslit(m?.titleTranslit || null);
          if (needsArtistTranslit) setDerivedArtistTranslit(m?.artistTranslit || null);
        }
      } catch {
        if (!cancelled) {
          if (needsArtist) setDerivedArtist(null);
          if (needsTranslit) {
            if (needsTitleTranslit) setDerivedTitleTranslit(null);
            if (needsArtistTranslit) setDerivedArtistTranslit(null);
          }
        }
      }
    }
    derive();
    return () => { cancelled = true; };
  }, [song?.artist, song?.path, song?.titleTranslit, song?.artistTranslit, showTransliterationBeta, showArtist]);

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
  const rawTitle = song?.title || "";
  const rawArtist = song?.artist || derivedArtist || "";
  const displayTitle = showTransliterationBeta
    && (song?.titleTranslit || derivedTitleTranslit)
    ? (song?.titleTranslit || derivedTitleTranslit)
    : rawTitle;
  const displayArtist = showTransliterationBeta
    && (song?.artistTranslit || derivedArtistTranslit)
    ? (song?.artistTranslit || derivedArtistTranslit)
    : rawArtist;
  const jacketPath = song?.jacket || "";

  const showSlice = hasScores;
  const shouldShowSlice = showSlice || showScoreSlice;

  const sliceLeft = showScoreSlice
    ? (scoreSliceLeft ?? '')
    : (displayScore != null ? displayScore.toLocaleString() : '0,000,000');
  const sliceRight = showScoreSlice
    ? (scoreSliceRight ?? '')
    : (
      displayScore != null
        ? `${grade}${lamp ? ` - ${lamp}` : ''}${flare ? ` ${flare}` : ''}`
        : 'No score'
    );

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
  const rankedLevelText = showRanked && song.rankedRating != null
    ? formatRankedRating(song.rankedRating)
    : null;
  const levelToDisplay = rankedLevelText ?? song.level;
  const levelText = rankedLevelText ?? formatLevelText(song.level);

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

  const handleCardClick = () => {
    if (onCardClick) {
      onCardClick(song);
      return;
    }
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
  };

  return (
    <div
      className={cardLinkClassName}
      onClick={handleCardClick}
    >
      <div
        className={
          'song-card' +
          (highlight ? ' highlight' : '') +
          (shouldShowSlice ? ' with-score-slice' : '') +
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
            <h3 className="song-title">{displayTitle}</h3>
            {showArtist && displayArtist && (
              <span className="song-card-artist" title={displayArtist}>
                {displayArtist}
              </span>
            )}
            {levelInTitleBlock && (
              <span className="song-level song-title-level">
                {renderLevel(levelToDisplay, song?.hasShock)}
              </span>
            )}
          </div>
          <div className="header-right">
            {song.game && (
              showGameLogo ? (
                <GameLogo
                  className="song-card-game-logo"
                  name={song.game}
                  alt={song.game}
                  width={46}
                  height={46}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <div className="game-chip" style={GAME_CHIP_STYLES[song.game] || GAME_CHIP_STYLES.DEFAULT}>
                  {song.game}
                </div>
              )
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
          <div
            className={`song-level-container${rankedLevelText ? " song-level-container-ranked" : ""}`}
          >
              <span
                className={`song-level${levelInTitleBlock ? " song-inline-level" : ""}${rankedLevelText ? " song-level-ranked" : ""}`}
              >
                {renderLevel(levelToDisplay, song?.hasShock)}
              </span>
              <div className="song-badges">
                {difficultyInfo && (
                  <span
                    className="difficulty-badge"
                    style={{ backgroundColor: difficultyInfo.color, color: difficultyInfo.textColor }}
                    data-level={levelText || undefined}
                  >
                    {difficultyInfo.name}
                    <span className="difficulty-badge-level">{levelText}</span>
                    {song?.hasShock && (
                      <FontAwesomeIcon
                        icon={faBolt}
                        className="difficulty-badge-shock"
                        title="Shock arrows"
                      />
                    )}
                  </span>
                )}
                {cardTag}
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
      {shouldShowSlice && (
        <div className={`song-score-slice ${scoreSliceClassName}`.trim()}>
          <span className="score-value">
            {sliceLeft}
          </span>
          <span className="score-extra">
            {sliceRight}
          </span>
        </div>
      )}
    </div>
  );
};

export default React.memo(SongCard);
