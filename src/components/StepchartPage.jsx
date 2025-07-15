import React, { useEffect, useState, useMemo, useContext } from "react";
import { useLocation } from 'react-router-dom';

import { ToggleBar } from "./ToggleBar";
import { StepchartSection } from "./StepchartSection";
import { DifficultyMeter, difficultyLevels, difficultyNameMapping } from './DifficultyMeter';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { useFilters } from '../contexts/FilterContext.jsx';
import { getBpmRange } from '../BPMTool.jsx';

import styles from "./StepchartPage.module.css";
import "../BPMTool.css";

const sectionSizesInMeasures = {
  1: 8,
  1.5: 5,
  2: 4,
  2.5: 3,
  3: 3,
};

const HEADER_ID = "stepchart-page-header";

// function scrollTargetBeatJustUnderHeader(beatId, headerId) {
//   setTimeout(() => {
//     const targetBeat = document.getElementById(beatId);
//     const header = document.getElementById(headerId);

//     if (targetBeat && header) {
//       const headerBounds = header.getBoundingClientRect();
//       targetBeat.scrollIntoView(true);
//       window.scrollBy(0, -headerBounds.height);
//     }
//   }, 10);
// }

export function StepchartPage({
  simfile,
  currentType: initialCurrentType,
  setCurrentChart,
  isCollapsed,
  setIsCollapsed,
  playStyle,
  speedmod,
}) {
  const [currentType, setCurrentType] = useState(initialCurrentType);
  const location = useLocation();
  const isLoading = !simfile;
  const { targetBPM, multipliers } = useContext(SettingsContext);
  const { filters } = useFilters();
  const [showAltBpm, setShowAltBpm] = useState(false);

  useEffect(() => {
    setCurrentType(initialCurrentType);
  }, [initialCurrentType]);

  // useEffect(() => {
  //   const hash = (window.location.hash ?? "").replace("#", "");
  //   if (hash) {
  //     scrollTargetBeatJustUnderHeader(hash, HEADER_ID);
  //   }
  // }, [location.hash]);

  const displaySimfile = simfile || {
    title: { titleName: 'Please select a song', translitTitleName: '' },
    artist: '...',
    mix: { mixName: '' },
    displayBpm: 'N/A',
    availableTypes: [],
    charts: {}
  };

  const calculation = useMemo(() => {
    if (!targetBPM || !displaySimfile.displayBpm || displaySimfile.displayBpm === 'N/A') return null;
    const numericTarget = Number(targetBPM) || 0;
    const bpmRange = getBpmRange(displaySimfile.displayBpm);
    if (bpmRange.max === 0) return null;
    const idealMultiplier = numericTarget / bpmRange.max;
    const closestMultiplier = multipliers.reduce((prev, curr) => Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev);
    const closestIndex = multipliers.indexOf(closestMultiplier);
    const primarySpeed = (bpmRange.max * closestMultiplier);
    let alternativeMultiplier = null;
    if (primarySpeed > numericTarget) {
        if (closestIndex > 0) alternativeMultiplier = multipliers[closestIndex - 1];
    } else {
        if (closestIndex < multipliers.length - 1) alternativeMultiplier = multipliers[closestIndex + 1];
    }
    const result = {
        primary: { modifier: closestMultiplier, minSpeed: Math.round(bpmRange.min * closestMultiplier), maxSpeed: Math.round(primarySpeed), isRange: bpmRange.min !== bpmRange.max },
        alternative: null
    };
    if (alternativeMultiplier) {
        const altMaxSpeed = (bpmRange.max * alternativeMultiplier);
        result.alternative = { modifier: alternativeMultiplier, minSpeed: Math.round(bpmRange.min * alternativeMultiplier), maxSpeed: Math.round(altMaxSpeed), isRange: bpmRange.min !== bpmRange.max, direction: altMaxSpeed > primarySpeed ? 'up' : 'down' };
    }
    if (result.alternative && result.primary.maxSpeed === result.alternative.maxSpeed) {
        result.alternative = null;
    }
    return result;
  }, [targetBPM, displaySimfile.displayBpm, multipliers]);

  const currentTypeMeta = displaySimfile.availableTypes.find(
    (at) => at.slug === currentType
  );

  const chart = currentTypeMeta ? displaySimfile.charts[currentType] : null;
  
  const sectionGroups = useMemo(() => {
    if (!chart) return [];
    
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

    const groups = [];
    const sectionsPerChunk = currentType.includes("single") ? 7 : 4;
    while (sections.length) {
      const sectionChunk = sections.splice(0, sectionsPerChunk);
      groups.push(
        <div
          key={groups.length}
          className={styles.stepchartSectionGroup}
          style={{ zIndex: 999 - groups.length }}
        >
          {sectionChunk}
        </div>
      );
    }
    return groups;
  }, [chart, speedmod, currentType]);


  const title = currentTypeMeta ? `${
    displaySimfile.title.translitTitleName || displaySimfile.title.titleName
  } - ${currentType.replace(/-/g, ", ")} (${currentTypeMeta.feet})` : displaySimfile.title.titleName;

  const renderDifficulties = (style) => {
    const chartDifficulties = displaySimfile.availableTypes.filter(t => t.mode === style);

    return difficultyLevels.map(levelName => {
        const type = chartDifficulties.find(t => t.difficulty === levelName.toLowerCase());
        let filteredOut = false;
        if (type) {
            if (filters.difficultyMin !== '' && type.feet < Number(filters.difficultyMin)) {
                filteredOut = true;
            }
            if (filters.difficultyMax !== '' && type.feet > Number(filters.difficultyMax)) {
                filteredOut = true;
            }
        }

        return (
            <DifficultyMeter
                key={`${style}-${levelName}`}
                level={!type || filteredOut ? 'X' : type.feet}
                difficultyName={levelName}
                isMissing={!type || filteredOut}
                isSelected={type && !filteredOut && type.slug === currentType}
                onClick={() => {
                  if (type && !filteredOut) {
                    setCurrentType(type.slug);
                    if (setCurrentChart) {
                        setCurrentChart(type);
                    }
                  }
                }}
            />
        );
    });
  };

  return (
    <>
      {simfile ? (
          <>
              <div className={styles.printTitle}>
                <div>
                  {displaySimfile.mix.mixName}: {title}
                </div>
              </div>
              {sectionGroups}
          </>
      ) : (
          <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>
              <p>{isLoading ? 'Loading chart...' : 'The step chart for the selected song will be displayed here.'}</p>
          </div>
      )}
    </>
  );
}