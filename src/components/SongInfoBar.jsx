import React, { useContext } from 'react';
import { DifficultyMeter } from './DifficultyMeter';
import { difficultyLevels, difficultyNameMapping } from '../utils/difficulties.js';
import { useFilters } from '../contexts/FilterContext.jsx';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { useScores } from '../contexts/ScoresContext.jsx';
import { getGrade } from '../utils/grades.js';
import { GAME_CHIP_STYLES } from '../utils/gameChipStyles.js';
import '../BPMTool.css';

const SongInfoBar = ({
  isCollapsed,
  setIsCollapsed,
  gameVersion,
  jacket,
  songTitle,
  artist,
  playStyle, // 'single' or 'double'
  difficulties,
  currentChart,
  setCurrentChart,
  simfileData,
  bpmDisplay,
  calculation,
  showAltBpm,
  setShowAltBpm,
  coreBpm,
  coreCalculation,
  showAltCoreBpm,
  setShowAltCoreBpm,
  songLength,
  metrics,
}) => {

  const { filters } = useFilters();
  const { showRankedRatings } = useContext(SettingsContext);
  const { scores } = useScores();
  const isDesktop = useIsDesktop();
  const chipStyle = React.useMemo(() => (
    gameVersion === 'NOMIX'
      ? { backgroundColor: 'var(--bg-color-dark)' }
      : (GAME_CHIP_STYLES[gameVersion] || GAME_CHIP_STYLES.DEFAULT)
  ), [gameVersion]);

  const currentScore = React.useMemo(() => {
    if (!currentChart) return null;
    const key = `${songTitle.toLowerCase()}-${currentChart.difficulty.toLowerCase()}`;
    return scores[currentChart.mode]?.[key] || null;
  }, [scores, currentChart, songTitle]);

  const lampClass = React.useMemo(() => {
    if (!currentScore?.lamp) return '';
    const lamp = currentScore.lamp.toLowerCase();
    if (lamp.includes('marvelous')) return 'glow-marvelous';
    if (lamp.includes('perfect')) return 'glow-perfect';
    if (lamp.includes('great')) return 'glow-great';
    if (lamp.includes('good')) return 'glow-good';
    return '';
  }, [currentScore]);

  const renderDifficulties = (style) => { // style is 'single' or 'double'
    if (!simfileData) {
        // Render placeholders if no song is selected
        return difficultyLevels.map(levelName => (
            <DifficultyMeter
                key={`${style}-${levelName}`}
                level={'X'}
                difficultyName={levelName}
                isMissing={true}
                onClick={() => {}}
                isSelected={false}
            />
        ));
    }

    if (!difficulties) return null;

    const difficultySet = style === 'single' ? difficulties.singles : difficulties.doubles;
    const chartDifficulties = simfileData.availableTypes.filter(t => t.mode === style);

    return difficultyLevels.map(levelName => {
        let level = null;
        let chartType = null;

        // Find the chart for the current difficulty level (e.g., 'Expert')
        for (const name of difficultyNameMapping[levelName]) {
            if (difficultySet[name]) {
                level = showRankedRatings && difficultySet[name].rankedRating != null ? difficultySet[name].rankedRating : difficultySet[name].feet;
                chartType = chartDifficulties.find(t => t.difficulty === name);
                if (chartType) break;
            }
        }

        let isMissing = !chartType;
        let filteredOut = false;

        // Now, check against filters
        if (chartType) {
            // Check level range filter
            if ((filters.difficultyMin && chartType.feet < Number(filters.difficultyMin)) ||
                (filters.difficultyMax && chartType.feet > Number(filters.difficultyMax))) {
                filteredOut = true;
            }
            // Check difficulty name filter
            if (filters.difficultyNames && filters.difficultyNames.length > 0) {
                const lowerCaseFilterNames = filters.difficultyNames.map(n => n.toLowerCase());
                if (!lowerCaseFilterNames.includes(chartType.difficulty.toLowerCase())) {
                    filteredOut = true;
                }
            }

            // Check played status filter
            const chartKey = `${songTitle.toLowerCase()}-${chartType.difficulty.toLowerCase()}`;
            const hasScore = scores[chartType.mode]?.[chartKey] != null;

            if (filters.playedStatus === 'played' && !hasScore) {
                filteredOut = true;
            }
            if (filters.playedStatus === 'notPlayed' && hasScore) {
                filteredOut = true;
            }
        }

        const isSelected = currentChart && chartType && currentChart.slug === chartType.slug;

    return (
            <DifficultyMeter
                key={`${style}-${levelName}`}
                level={isMissing || filteredOut ? 'X' : level}
                difficultyName={levelName}
                isMissing={isMissing || filteredOut}
                onClick={() => chartType && !filteredOut && setCurrentChart(chartType)}
                isSelected={isSelected}
            />
        );
    });
  };

  const bpmRange = React.useMemo(() => {
    if (!bpmDisplay || bpmDisplay === 'N/A') return { min: null, max: null };
    if (bpmDisplay.includes('-')) {
      const [min, max] = bpmDisplay.split('-').map(v => Number(v.trim()));
      return { min, max };
    }
    const val = Number(bpmDisplay);
    return { min: val, max: val };
  }, [bpmDisplay]);

  const minAdjusted = calculation
    ? (showAltBpm && calculation.alternative
        ? calculation.alternative.minSpeed
        : calculation.primary.minSpeed)
    : null;
  const maxAdjusted = calculation
    ? (showAltBpm && calculation.alternative
        ? calculation.alternative.maxSpeed
        : calculation.primary.maxSpeed)
    : null;
  const coreAdjusted = coreCalculation
    ? (showAltCoreBpm && coreCalculation.alternative
        ? coreCalculation.alternative.speed
        : coreCalculation.primary.speed)
    : null;
  const multiplier = calculation
    ? (showAltBpm && calculation.alternative
        ? calculation.alternative.modifier
        : calculation.primary.modifier)
    : null;
  const coreMultiplier = coreCalculation
    ? (showAltCoreBpm && coreCalculation.alternative
        ? coreCalculation.alternative.modifier
        : coreCalculation.primary.modifier)
    : null;

  const hasAlt = (calculation && calculation.alternative) || (coreCalculation && coreCalculation.alternative);
  const toggleAlt = () => {
    if (calculation && calculation.alternative) setShowAltBpm(!showAltBpm);
    if (coreCalculation && coreCalculation.alternative) setShowAltCoreBpm(!showAltCoreBpm);
  };

  return (
    <div className={`song-info-bar ${isCollapsed ? 'collapsed' : ''}`}>
      <div
        className="song-title-container"
        onClick={() => setIsCollapsed(!isCollapsed)}
        role="button"
        aria-expanded={!isCollapsed}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsCollapsed(!isCollapsed);
          }
        }}
      >
        {jacket && (
          <>
            <div
              className="jacket-bg"
              style={{ backgroundImage: `url("/${encodeURI(jacket)}")` }}
            />
            <div className="jacket-fade" />
          </>
        )}
        <h2 className="bpm-song-title bpm-title-mobile">
          <div className="title-content-wrapper">
            {gameVersion && (
              <>
                {/* Desktop: show jacket image/legacy logo chip at left */}
                {isDesktop && (
                  <span
                    className="song-game-version desktop-only"
                    style={chipStyle}
                    title={gameVersion}
                  >
                    {gameVersion === 'NOMIX' ? (
                      <div className="chip-placeholder" aria-hidden></div>
                    ) : jacket ? (
                      <div className="chip-img-stack" aria-hidden>
                        <img
                          className="game-logo-img chip-img base"
                          src={`/${encodeURI(jacket)}`}
                          alt=""
                          width={90}
                          height={90}
                          loading="eager"
                          decoding="sync"
                          draggable={false}
                        />
                        {/* Overlay logo appears on hover */}
                        <img
                          className="game-logo-img chip-img logo"
                          src={`/img/logos/${encodeURIComponent(gameVersion)}.jpg`}
                          alt=""
                          width={90}
                          height={90}
                          loading="eager"
                          decoding="sync"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <GameLogo key={gameVersion} name={gameVersion} />
                    )}
                  </span>
                )}
                {/* Mobile: text chip remains */}
                <span
                  className="song-game-version mobile-only"
                  style={chipStyle}
                >
                  {gameVersion}
                </span>
              </>
            )}
            <div className="title-artist-group">
              {/* Desktop: show version chip above song title */}
              {isDesktop && gameVersion && (
                <span
                  className="song-game-version text-chip desktop-only"
                  style={chipStyle}
                >
                  {gameVersion}
                </span>
              )}
              <span className="song-title-main" title={songTitle}>
                {songTitle}
              </span>
              <span className="song-title-artist" title={artist}>
                {artist}
              </span>
            </div>
          </div>
          <button
            className="collapse-button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
          </button>
        </h2>
      </div>
      {!isCollapsed && (
        <div className="info-content">
          <div className="info-left">
            <div className={`difficulty-meters-container${showRankedRatings ? ' ranked' : ''}`}>
              {renderDifficulties(playStyle)}
            </div>
            {(songLength != null || metrics) && (
              <div className="stats-grid">
                <div className="stat-item">
                  <i className="fa-solid fa-clock"></i>
                  <span>{songLength != null ? `${Math.floor(songLength / 60)}:${String(Math.round(songLength % 60)).padStart(2, '0')}` : 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <i className="fa-solid fa-play"></i>
                  <span>{metrics?.firstNoteSeconds != null ? `${Number(metrics.firstNoteSeconds).toFixed(2)}s` : 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <i className="fa-solid fa-shoe-prints"></i>
                  <span>{metrics?.steps?.toLocaleString?.() ?? 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <i className="fa-solid fa-snowflake"></i>
                  <span>{metrics?.holds?.toLocaleString?.() ?? 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <i className="fa-solid fa-bolt"></i>
                  <span>{metrics?.shocks?.toLocaleString?.() ?? 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <i className="fa-solid fa-arrow-up"></i>
                  <span>{metrics?.jumps?.toLocaleString?.() ?? 'N/A'}</span>
                </div>
              </div>
            )}
            <div className={`bpm-score-badge score-badge ${lampClass}`}>
              <span className="score-lamp">{currentScore?.lamp ?? ''}</span>
              <span className="score-value">{currentScore ? currentScore.score.toLocaleString() : '--'}</span>
              <span className="score-extra">{currentScore ? `${getGrade(currentScore.score)}${currentScore.flare ? ` ${currentScore.flare}` : ''}` : ''}</span>
            </div>
          </div>
          <div className="info-right">
            <div className="bpm-table" onClick={hasAlt ? toggleAlt : undefined} title={hasAlt ? 'Toggle alt speeds' : undefined}>
                <div className="bpm-row header">
                  <span>Min</span>
                  <span className="bpm-sep"></span>
                  <span>Max</span>
                  <span>Core</span>
                </div>
                <div className="bpm-row">
                  <span>{bpmRange.min != null ? bpmRange.min : 'N/A'}</span>
                  <span className="bpm-sep">—</span>
                  <span>{bpmRange.max != null ? bpmRange.max : 'N/A'}</span>
                  <span>{coreBpm ? coreBpm.toFixed(0) : 'N/A'}</span>
                </div>
                <div className="bpm-row">
                  <span>{minAdjusted != null ? minAdjusted : 'N/A'}</span>
                  <span className="bpm-sep">—</span>
                  <span>{maxAdjusted != null ? maxAdjusted : 'N/A'}</span>
                  <span>{coreAdjusted != null ? coreAdjusted : 'N/A'}</span>
                </div>
                <div className="bpm-row">
                  <span style={{ gridColumn: '1 / span 3' }}>
                    {multiplier != null ? `${multiplier}x` : 'N/A'}
                    {hasAlt && calculation?.alternative?.direction && (
                      <i
                        className={`fa-solid ${calculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'} bpm-dir ${calculation.alternative.direction} ${showAltBpm ? 'active' : ''}`}
                      ></i>
                    )}
                  </span>
                  <span>
                    {coreMultiplier != null ? `${coreMultiplier}x` : 'N/A'}
                    {hasAlt && coreCalculation?.alternative?.direction && (
                      <i
                        className={`fa-solid ${coreCalculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'} bpm-dir ${coreCalculation.alternative.direction} ${showAltCoreBpm ? 'active' : ''}`}
                      ></i>
                    )}
                  </span>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SongInfoBar;
// Desktop-only logo component with extension fallback from public/img/logos
function GameLogo({ name }) {
  if (!name) return null;
  const fileName = encodeURIComponent(name);
  const src = `/img/logos/${fileName}.jpg`;
  return (
    <img
      className="game-logo-img"
      src={src}
      alt={name}
      width={90}
      height={90}
      loading="eager"
      decoding="sync"
      draggable={false}
    />
  );
}

// Hook: true on desktop viewports only; prevents rendering on mobile
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1025px)').matches : true
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1025px)');
    const handler = (e) => setIsDesktop(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);
  return isDesktop;
}
