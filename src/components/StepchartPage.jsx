import React, { useEffect, useState, useMemo, useContext } from "react";

import { ToggleBar } from "./ToggleBar";
import { StepchartSection } from "./StepchartSection";
import { DifficultyMeter } from './DifficultyMeter';
import { SettingsContext } from '../contexts/SettingsContext.jsx';
import { formatRankedRating } from '../utils/formatRankedRating.js';

import styles from "./StepchartPage.module.css";
import "../BPMTool.css";

const sectionSizesInMeasures = {
  1: 8,
  1.5: 5,
  2: 4,
  2.5: 3,
  3: 3,
};
const MIN_CHUNK_COLUMNS = 1;
const MAX_CHUNK_COLUMNS = 5;

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
  chunkColumns = 1,
}) {
  const [currentType, setCurrentType] = useState(initialCurrentType);
  const isLoading = !simfile;
  const { showRankedRatings, showTransliterationBeta } = useContext(SettingsContext);

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

  const chartLayout = useMemo(() => {
    if (!chart) return [];
    const normalizedColumns = Math.min(MAX_CHUNK_COLUMNS, Math.max(MIN_CHUNK_COLUMNS, Math.round(Number(chunkColumns) || 1)));

    const { arrows, freezes } = chart;
    const lastArrowOffset = (arrows[arrows.length - 1]?.offset ?? 0) + 0.25;
    const lastFreezeOffset = freezes[freezes.length - 1]?.endOffset ?? 0;
    const totalSongHeight = Math.max(lastArrowOffset, lastFreezeOffset);

    const sections = [];
    for (let i = 0; i < totalSongHeight; i += sectionSizesInMeasures[speedmod]) {
      sections.push({
        startOffset: i,
        endOffset: Math.min(totalSongHeight, i + sectionSizesInMeasures[speedmod]),
        zIndex: Math.round(totalSongHeight) - i,
      });
    }

    const groups = [];
    const targetColumns = Math.max(1, Math.min(normalizedColumns, sections.length || 1));
    const chunkSize = Math.ceil(sections.length / targetColumns);

    for (let col = 0; col < targetColumns; col += 1) {
      const start = col * chunkSize;
      if (start >= sections.length) break;
      if (col === targetColumns - 1) {
        groups.push(sections.slice(start));
      } else {
        groups.push(sections.slice(start, start + chunkSize));
      }
    }

    return {
      groups,
      chunkColumns: groups.length,
      multiColumn: groups.length > 1,
    };
  }, [chart, speedmod, chunkColumns]);

  const sectionGroups = useMemo(() => {
    if (!chart || !chartLayout.groups) return [];

    return chartLayout.groups.map((sectionChunk, chunkIndex) => (
      <div
        key={chunkIndex}
        className={`${styles.stepchartSectionGroup} ${chartLayout.multiColumn ? styles.stepchartSectionGroupHorizontal : ""}`.trim()}
        style={chartLayout.multiColumn ? undefined : { zIndex: 999 - chunkIndex }}
      >
        {sectionChunk.map((section) => (
            <StepchartSection
              key={section.startOffset}
              chart={chart}
              speedMod={speedmod}
              startOffset={section.startOffset}
              endOffset={section.endOffset}
              showSideMarkers
              showTimeLabels
              style={{ zIndex: section.zIndex }}
            />
          ))}
      </div>
    ));
  }, [chart, chartLayout, speedmod]);


  const displayTitle = showTransliterationBeta && displaySimfile.title.translitTitleName
    ? displaySimfile.title.translitTitleName
    : displaySimfile.title.titleName;
  const title = currentTypeMeta
    ? `${displayTitle} - ${currentType.replace(/-/g, ", ")} (${showRankedRatings && currentTypeMeta.rankedRating != null ? formatRankedRating(currentTypeMeta.rankedRating) : currentTypeMeta.feet})`
    : displayTitle;


  return (
    <>
      {simfile ? (
          <>
              <div className={styles.printTitle}>
                <div>
                  {displaySimfile.mix.mixName}: {title}
                </div>
              </div>
              {chartLayout.multiColumn ? (
                <div className={`${styles.stepchartSections} ${styles.stepchartSectionsHorizontal}`.trim()}>
                  <div className={styles.stepchartSectionsHorizontalInner} style={{ "--chunk-columns": chartLayout.chunkColumns }}>
                    {sectionGroups}
                  </div>
                </div>
              ) : (
                <div className={styles.stepchartSections}>
                  {sectionGroups}
                </div>
              )}
          </>
      ) : (
          <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted-color)', textAlign: 'center', padding: '1rem' }}>
              <p>{isLoading ? '' : 'The step chart for the selected song will be displayed here.'}</p>
          </div>
      )}
    </>
  );
}
