import React from 'react';
import { DifficultyMeter, difficultyLevels, difficultyNameMapping } from './DifficultyMeter';
import { useFilters } from '../contexts/FilterContext.jsx';
import '../BPMTool.css';

const SongInfoBar = ({
  isCollapsed,
  setIsCollapsed,
  gameVersion,
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
}) => {

  const { filters } = useFilters();

  const renderDifficulties = (style) => { // style is 'single' or 'double'
    if (!simfileData || !difficulties) return null;

    const difficultySet = style === 'single' ? difficulties.singles : difficulties.doubles;
    const chartDifficulties = simfileData.availableTypes.filter(t => t.mode === style);

    return difficultyLevels.map(levelName => {
        let level = null;
        let difficulty = null;
        let chartType = null;
        let filteredOut = false;

        for (const name of difficultyNameMapping[levelName]) {
            if (difficultySet[name]) {
                level = difficultySet[name];
                difficulty = name;
                chartType = chartDifficulties.find(t => t.difficulty === name);
                if (chartType) break;
            }
        }

        if (chartType) {
            if (filters.difficultyMin !== '' && chartType.feet < Number(filters.difficultyMin)) {
                filteredOut = true;
            }
            if (filters.difficultyMax !== '' && chartType.feet > Number(filters.difficultyMax)) {
                filteredOut = true;
            }
        }

        const isSelected = currentChart && chartType && currentChart.slug === chartType.slug;

        return (
            <DifficultyMeter
                key={`${style}-${levelName}`}
                level={!level || filteredOut ? 'X' : level}
                difficultyName={levelName}
                isMissing={!level || filteredOut}
                onClick={() => chartType && !filteredOut && setCurrentChart(chartType)}
                isSelected={isSelected}
            />
        );
    });
  };

  return (
    <div className={`song-info-bar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="song-title-container">
        <h2 className="song-title bpm-title-mobile">
          <div className="title-content-wrapper">
            {gameVersion && <span className="song-game-version">{gameVersion}</span>}
            <div className="title-artist-group">
              <span className="song-title-main">{songTitle}</span>
              <span className="song-title-separator"> - </span>
              <span className="song-title-artist">{artist}</span>
            </div>
          </div>
          <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
            <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
          </button>
        </h2>
      </div>
      {!isCollapsed && (
        <div className="details-grid bpm-tool-grid">
          <div className={`grid-item difficulty-container ${playStyle === 'single' ? 'grid-item-sp' : 'grid-item-dp'}`}>
              <span className="difficulty-label">Difficulty:</span>
              <div className="difficulty-meters-container">
                {renderDifficulties(playStyle)}
              </div>
          </div>
          <div className="bpm-core-container">
            <div className="grid-item grid-item-bpm">
              <span className="bpm-label">BPM:</span>
              <div className="bpm-value-container">
                <span className="bpm-value">{bpmDisplay}</span>
                {calculation && (
                  <div className="song-calculation">
                    <span className="song-speed">
                      {(showAltBpm && calculation.alternative) ? (calculation.alternative.isRange ? `${calculation.alternative.minSpeed}-${calculation.alternative.maxSpeed}` : calculation.alternative.maxSpeed) : (calculation.primary.isRange ? `${calculation.primary.minSpeed}-${calculation.primary.maxSpeed}` : calculation.primary.maxSpeed)}
                    </span>
                    <span className="song-separator">@</span>
                    <span className="song-modifier">{(showAltBpm && calculation.alternative) ? calculation.alternative.modifier : calculation.primary.modifier}x</span>
                  </div>
                )}
                {calculation && calculation.alternative && (
                  <button className={`toggle-button ${showAltBpm && calculation.alternative ? (calculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`} onClick={() => setShowAltBpm(!showAltBpm)}>
                    <i className={`fa-solid ${calculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                  </button>
                )}
              </div>
              </div>
              <div className="grid-item grid-item-core">
                <span className="core-bpm-label">CORE:</span>
                <div className="core-bpm-value-container">
                  <span className="core-bpm-value">{coreBpm ? coreBpm.toFixed(0) : 'N/A'}</span>
                {coreCalculation && (
                  <div className="song-calculation">
                    <span className="song-speed">
                      {(showAltCoreBpm && coreCalculation.alternative) ? coreCalculation.alternative.speed : coreCalculation.primary.speed}
                    </span>
                    <span className="song-separator">@</span>
                    <span className="song-modifier">{(showAltCoreBpm && coreCalculation.alternative) ? coreCalculation.alternative.modifier : coreCalculation.primary.modifier}x</span>
                  </div>
                )}
                {coreCalculation && coreCalculation.alternative && (
                  <button className={`toggle-button ${showAltCoreBpm && coreCalculation.alternative ? (coreCalculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`} onClick={() => setShowAltCoreBpm(!showAltCoreBpm)}>
                    <i className={`fa-solid ${coreCalculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                  </button>
                )}
                </div>
              </div>
              <div className="grid-item grid-item-length">
                <span className="core-bpm-label">Length:</span>
                <div className="core-bpm-value-container">
                  <span className="core-bpm-value">{songLength ? `${Math.floor(songLength / 60)}:${String(Math.round(songLength % 60)).padStart(2, '0')}` : 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default SongInfoBar;