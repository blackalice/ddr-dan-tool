import React, { useEffect, useState, useMemo, useContext } from "react";

import { ToggleBar } from "./ToggleBar";
import { StepchartSection } from "./StepchartSection";
import { DifficultyMeter } from './DifficultyMeter';
import { SettingsContext } from '../contexts/SettingsContext.jsx';

import styles from "./StepchartPage.module.css";
import "../BPMTool.css";

const sectionSizesInMeasures = {
  1: 8,
  1.5: 5,
  2: 4,
  2.5: 3,
  3: 3,
};

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
  speedmod,
}) {
  const [currentType, setCurrentType] = useState(initialCurrentType);
  const isLoading = !simfile;
  const { showRankedRatings } = useContext(SettingsContext);

  useEffect(() => {
    setCurrentType(initialCurrentType);
  }, [initialCurrentType]);

  // useEffect(() => {
  //   const hash = (window.location.hash ?? "").replace("#", "");
  //   if (hash) {
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
        />
      );
    }

    const groups = [];
    const sectionsPerChunk = currentType.includes('single') ? 7 : 4;
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


  const title = currentTypeMeta
    ? `${displaySimfile.title.translitTitleName || displaySimfile.title.titleName} - ${currentType.replace(/-/g, ", ")} (${showRankedRatings && currentTypeMeta.rankedRating != null ? currentTypeMeta.rankedRating : currentTypeMeta.feet})`
    : displaySimfile.title.titleName;


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
          <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted-color)', textAlign: 'center', padding: '1rem' }}>
              <p>{isLoading ? 'Loading chart...' : 'The step chart for the selected song will be displayed here.'}</p>
          </div>
      )}
    </>
  );
}