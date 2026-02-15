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
const STREAM_GAP_THRESHOLD = 0.125;
const STREAM_MIN_ROWS = 8;
const BURST_MIN_ROWS = 4;
const CROSSOVER_SEQUENCE_GAP_THRESHOLD = 0.5;
const OFFSET_KEY_PRECISION = 5;
const STEP_PATTERN_HIGHLIGHTS_ENABLED = false;

const offsetKey = (offset) => Number(offset || 0).toFixed(OFFSET_KEY_PRECISION);

const getTapLanes = (direction) => {
  if (typeof direction !== "string") return [];
  const lanes = [];
  for (let i = 0; i < direction.length; i += 1) {
    if (direction[i] !== "0") lanes.push(i);
  }
  return lanes;
};

const isRightSideLane = (lane, laneCount) => lane >= laneCount / 2;

const crossoverPenalty = (foot, lane, laneCount) =>
  (foot === "L" && isRightSideLane(lane, laneCount))
  || (foot === "R" && !isRightSideLane(lane, laneCount))
    ? 1
    : 0;

const getCrossoverSequenceIndices = (events) => {
  const highlighted = new Set();
  if (!Array.isArray(events) || events.length < 3) return highlighted;

  for (let i = 1; i < events.length - 1; i += 1) {
    const current = events[i];
    if (!current?.crossovers) continue;

    const previous = events[i - 1];
    const next = events[i + 1];
    if (!previous || !next) continue;

    const hasTightPreviousGap =
      (current.offset - previous.offset) <= CROSSOVER_SEQUENCE_GAP_THRESHOLD;
    const hasTightNextGap =
      (next.offset - current.offset) <= CROSSOVER_SEQUENCE_GAP_THRESHOLD;

    if (!hasTightPreviousGap || !hasTightNextGap) continue;
    highlighted.add(i - 1);
    highlighted.add(i);
    highlighted.add(i + 1);
  }

  return highlighted;
};

const classifyPatternRows = (chart) => {
  const patternByOffset = new Map();
  if (!chart?.arrows?.length) return patternByOffset;
  if (!STEP_PATTERN_HIGHLIGHTS_ENABLED) return patternByOffset;

  const rows = chart.arrows
    .map((arrow) => ({
      offset: Number(arrow?.offset ?? 0),
      lanes: getTapLanes(arrow?.direction || ""),
    }))
    .filter((row) => row.lanes.length > 0)
    .sort((a, b) => a.offset - b.offset);

  const addPattern = (offset, pattern) => {
    const key = offsetKey(offset);
    const existing = patternByOffset.get(key);
    if (existing) {
      existing.add(pattern);
      return;
    }
    patternByOffset.set(key, new Set([pattern]));
  };

  // Streams / bursts from dense consecutive rows.
  let runStart = 0;
  for (let i = 1; i <= rows.length; i += 1) {
    const contiguous =
      i < rows.length && (rows[i].offset - rows[i - 1].offset) <= STREAM_GAP_THRESHOLD;
    if (contiguous) continue;

    const runLength = i - runStart;
    if (runLength >= BURST_MIN_ROWS) {
      const pattern = runLength >= STREAM_MIN_ROWS ? "streams" : "bursts";
      for (let k = runStart; k < i; k += 1) {
        addPattern(rows[k].offset, pattern);
      }
    }
    runStart = i;
  }

  // Crossovers / doublesteps from a lightweight foot assignment model.
  const singleRows = rows.filter((row) => row.lanes.length === 1);
  if (singleRows.length < 2) return patternByOffset;
  const laneCount = Math.max(...singleRows.map((row) => row.lanes[0])) + 1;

  let states = ["L", "R"].map((foot) => ({
    foot,
    lane: singleRows[0].lanes[0],
    cost: crossoverPenalty(foot, singleRows[0].lanes[0], laneCount),
    history: [{ offset: singleRows[0].offset, crossovers: false, doublesteps: false }],
  }));

  for (let i = 1; i < singleRows.length; i += 1) {
    const row = singleRows[i];
    const lane = row.lanes[0];
    const nextStates = [];

    for (const candidateFoot of ["L", "R"]) {
      let best = null;
      for (const prev of states) {
        const doubled = candidateFoot === prev.foot && lane !== prev.lane;
        const crossed = crossoverPenalty(candidateFoot, lane, laneCount) > 0;
        const movement = Math.abs(lane - prev.lane) * 0.06;
        const cost = prev.cost + (doubled ? 1.25 : 0) + (crossed ? 1 : 0) + movement;
        if (!best || cost < best.cost) {
          best = {
            foot: candidateFoot,
            lane,
            cost,
            history: prev.history.concat({
              offset: row.offset,
              crossovers: crossed,
              doublesteps: doubled,
            }),
          };
        }
      }
      nextStates.push(best);
    }
    states = nextStates;
  }

  const bestState = states[0].cost <= states[1].cost ? states[0] : states[1];
  const crossoverSequenceIndices = getCrossoverSequenceIndices(bestState.history);
  for (let i = 0; i < bestState.history.length; i += 1) {
    const event = bestState.history[i];
    if (crossoverSequenceIndices.has(i)) addPattern(event.offset, "crossovers");
    if (event.doublesteps) addPattern(event.offset, "doublesteps");
  }

  return patternByOffset;
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
  chunkColumns = 1,
  highlightPatterns = {},
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
  const patternByOffset = useMemo(() => classifyPatternRows(chart), [chart]);

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
              patternByOffset={patternByOffset}
              highlightPatterns={highlightPatterns}
              style={{ zIndex: section.zIndex }}
            />
          ))}
      </div>
    ));
  }, [chart, chartLayout, speedmod, patternByOffset, highlightPatterns]);


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
