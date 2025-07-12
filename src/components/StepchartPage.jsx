import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { useLocation } from 'react-router-dom';

import { ImageFrame } from "./ImageFrame";
import { Breadcrumbs } from "./Breadcrumbs";
import { TitleDetailsTable, TitleDetailsRow } from "./TitleDetailsTable";
import { ToggleBar } from "./ToggleBar";
import { Banner } from "./Banner";
import { StepchartSection } from "./StepchartSection";
import { DifficultyMeter, difficultyLevels, difficultyNameMapping } from './DifficultyMeter';
import SongPicker from './SongPicker';

import styles from "./StepchartPage.module.css";
import "../BPMTool.css";

const speedmods = [1, 1.5, 2, 3];
const sectionSizesInMeasures = {
  1: 8,
  1.5: 5,
  2: 4,
  3: 3,
};

const HEADER_ID = "stepchart-page-header";

function scrollTargetBeatJustUnderHeader(beatId, headerId) {
  setTimeout(() => {
    const targetBeat = document.getElementById(beatId);
    const header = document.getElementById(headerId);

    if (targetBeat && header) {
      const headerBounds = header.getBoundingClientRect();
      targetBeat.scrollIntoView(true);
      window.scrollBy(0, -headerBounds.height);
    }
  }, 10);
}

export function StepchartPage({
  simfile,
  currentType: initialCurrentType,
  setCurrentChart,
  selectedGame,
  setSelectedGame,
  selectedSong,
  setSelectedSong,
  smData,
  songOptions,
  inputValue,
  setInputValue,
}) {
  const [currentType, setCurrentType] = useState(initialCurrentType);
  const [speedmod, setSpeedmod] = useState(speedmods[0]);
  const location = useLocation();

  useEffect(() => {
    setCurrentType(initialCurrentType);
  }, [initialCurrentType]);

  useEffect(() => {
    const hash = (window.location.hash ?? "").replace("#", "");
    if (hash) {
      scrollTargetBeatJustUnderHeader(hash, HEADER_ID);
    }
  }, [location.hash]);

  const currentTypeMeta = simfile.availableTypes.find(
    (at) => at.slug === currentType
  );

  if (!currentTypeMeta) {
    return <div>Chart not found</div>;
  }

  const chart = simfile.charts[currentType];
  const { arrows, freezes } = chart;

  const lastArrowOffset = (arrows[arrows.length - 1]?.offset ?? 0) + 0.25;
  const lastFreezeOffset = freezes[freezes.length - 1]?.endOffset ?? 0;
  const totalSongHeight = Math.max(lastArrowOffset, lastFreezeOffset);

  const sections = [];
  for (let i = 0; i < totalSongHeight; i += sectionSizesInMeasures[speedmod]) {
    sections.push(
      <StepchartSection
        key={i}
        chart={chart}
        speedMod={speedmod}
        startOffset={i}
        endOffset={Math.min(totalSongHeight, i + sectionSizesInMeasures[speedmod])}
        style={{ zIndex: Math.round(totalSongHeight) - i }}
        headerId={HEADER_ID}
      />
    );
  }

  const sectionGroups = [];
  const sectionsPerChunk = currentType.includes("single") ? 7 : 4;
  while (sections.length) {
    const sectionChunk = sections.splice(0, sectionsPerChunk);
    sectionGroups.push(
      <div
        key={sectionGroups.length}
        className={styles.stepchartSectionGroup}
        style={{ zIndex: 99999 - sectionGroups.length }}
      >
        {sectionChunk}
      </div>
    );
  }

  const title = `${
    simfile.title.translitTitleName || simfile.title.titleName
  } - ${currentType.replace(/-/g, ", ")} (${currentTypeMeta.feet})`;

  const renderDifficulties = (playStyle) => {
    const chartDifficulties = simfile.availableTypes.filter(t => t.mode === playStyle);

    return difficultyLevels.map(levelName => {
        const type = chartDifficulties.find(t => t.difficulty === levelName.toLowerCase());
        
        return (
            <DifficultyMeter 
                key={`${playStyle}-${levelName}`} 
                level={type ? type.feet : 'X'} 
                difficultyName={levelName} 
                isMissing={!type}
                isSelected={type?.slug === currentType}
                onClick={() => {
                  if (type) {
                    setCurrentType(type.slug);
                    setCurrentChart(type);
                  }
                }}
            />
        );
    });
};

  return (
    <div className={styles.rootPrint}>
      <div className="chart-section">
        <div className="selection-container">
        </div>
        <div className="song-info-bar">
            <div className="song-title-container">
                <h2 className="song-title bpm-title-mobile">
                    <div className="title-content-wrapper">
                        {simfile.mix.mixName && <span className="song-game-version">{simfile.mix.mixName}</span>}
                        <div className="title-artist-group">
                            <span className="song-title-main">{simfile.title.titleName}</span>
                            <span className="song-title-separator"> - </span>
                            <span className="song-title-artist">{simfile.artist}</span>
                        </div>
                    </div>
                </h2>
            </div>
            <div className="details-grid bpm-tool-grid">
                <div className="grid-item grid-item-sp">
                    <span className="play-style">SP</span>
                    <div className="difficulty-meters-container">
                        {renderDifficulties('single')}
                    </div>
                </div>
                <div className="grid-item grid-item-bpm">
                    <span className="bpm-label">BPM:</span>
                    <div className="bpm-value-container">
                        <span className="bpm-value">{simfile.displayBpm}</span>
                    </div>
                </div>
                <div className="grid-item grid-item-dp">
                    <span className="play-style">DP</span>
                    <div className="difficulty-meters-container">
                        {renderDifficulties('double')}
                    </div>
                </div>
                <div className="grid-item grid-item-core">
                  <div className={styles.speedmodContainer}>
                    <div className={styles.speedmodLabel}>SMOD</div>
                    <ToggleBar
                      namespace="speedmod"
                      entries={speedmods.map((sm) => (
                        <div key={sm}>{sm}</div>
                      ))}
                      onToggle={(i) => setSpeedmod(speedmods[i])}
                      checkedIndex={speedmods.indexOf(speedmod)}
                    />
                  </div>
                </div>
            </div>
        </div>
        <div className={styles.printTitle}>
          <div>
            {simfile.mix.mixName}: {title}
          </div>
        </div>
        {sectionGroups}
      </div>
    </div>
  );
}