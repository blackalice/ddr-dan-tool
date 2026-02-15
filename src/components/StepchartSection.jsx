import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { FreezeBody } from "./FreezeBody";
import { GiStopSign } from "react-icons/gi";
import { FiLink } from "react-icons/fi";
import { ArrowImg } from "./ArrowImg";
import { timeAtOffset } from "../utils/chartMetrics.js";

import styles from "./StepchartSection.module.css";

const BPM_RANGE_COLOR = "rgba(100, 0, 60, 0.115)";
const TIME_LABEL_INTERVAL_MEASURES = 2;
const BPM_TIME_COLLISION_EPSILON = 0.01;
const TIME_LABEL_COLLISION_SHIFT = "1.5rem";
const OFFSET_KEY_PRECISION = 5;
const PATTERN_HIGHLIGHT_PRIORITY = [
  ["crossovers", "patternCrossover"],
  ["doublesteps", "patternDoublestep"],
  ["bursts", "patternBurst"],
  ["streams", "patternStream"],
];

const offsetKey = (offset) => Number(offset || 0).toFixed(OFFSET_KEY_PRECISION);

const formatTimeLabel = (seconds) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safe);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const getHighlightClassName = (offset, patternByOffset, highlightPatterns) => {
  if (!patternByOffset || !highlightPatterns) return null;
  const patternsAtOffset = patternByOffset.get(offsetKey(offset));
  if (!patternsAtOffset?.size) return null;

  for (const [patternKey, className] of PATTERN_HIGHLIGHT_PRIORITY) {
    if (highlightPatterns[patternKey] && patternsAtOffset.has(patternKey)) {
      return className;
    }
  }
  return null;
};

function SelfLink({
  style,
  id,
  onClick,
}) {
  return (
    <a
      className={clsx(styles.selfLink, "float-left -mx-8 w-10")}
      href={`#${id}`}
      style={style}
      onClick={onClick}
    >
      <FiLink />
    </a>
  );
}

function StepchartSection({
  className,
  style,
  chart,
  speedMod,
  startOffset,
  endOffset,
  showSideMarkers = true,
  showTimeLabels = true,
  patternByOffset = null,
  highlightPatterns = {},
}) {
  const [targetedBeat, setTargetedBeat] = useState(null);

  useEffect(() => {
    const hash = (window.location.hash ?? "").replace("#", "");
    if (hash) {
      setTargetedBeat(hash);
    }
  }, []);

  const { arrows, freezes, bpm, stops } = chart;

  if (arrows.length === 0 && freezes.length === 0) {
    return null;
  }

  const isSingle = arrows.length > 0 ? arrows[0].direction.length === 4 : freezes[0].direction < 4;
  const singleDoubleClass = isSingle ? styles.containerSingle : styles.containerDouble;

  const barHeight = `var(--arrow-size) * ${speedMod}`;
  const measureHeight = `calc(${barHeight} * 4)`;
  const arrowAdjustment = `calc((${barHeight} - var(--arrow-size)) / 2)`;

  const arrowImgs = [];

  for (let ai = arrows.length - 1; ai >= 0; --ai) {
    const a = arrows[ai];

    if (a.offset >= endOffset) {
      continue;
    }

    if (a.offset < startOffset) {
      break;
    }

    const isShockArrow = a.direction.indexOf("M") !== -1;
    const isFreezeArrow = a.direction.indexOf("2") > -1;
    const highlightClassName = getHighlightClassName(
      a.offset,
      patternByOffset,
      highlightPatterns,
    );

    for (let i = 0; i < a.direction.length; ++i) {
      if (a.direction[i] !== "0") {
        arrowImgs.push(
          <ArrowImg
            key={`Arrow-${ai}-${i}`}
            className={highlightClassName ? styles[highlightClassName] : null}
            highlighted={Boolean(highlightClassName)}
            position={i}
            beat={isShockArrow ? "shock" : isFreezeArrow ? "freeze" : a.beat}
            style={{
              top: `calc((${a.offset} - ${startOffset}) * ${measureHeight} + ${arrowAdjustment})`,
            }}
          />
        );
      }
    }
  }

  const barDivs = [];

  for (let i = 0; i < Math.ceil(endOffset - startOffset) / 0.25; ++i) {
    const id = `beat-${(startOffset + i * 0.25) * 4 + 1}`;
    const height = `calc(var(--arrow-size) * ${speedMod})`;

    barDivs.push(
      <div
        key={id}
        // id={id}
        className={clsx(styles.bar, {
          [styles.barMeasure]: (i + 1) % 4 === 0,
          [styles.barBeat]: (i + 1) % 4 !== 0,
          [styles.targeted]: id === targetedBeat,
        })}
        style={{
          height,
        }}
      >
      </div>
    );
  }

  const freezeDivs = freezes.map((f) => {
    const inRangeStartOffset = Math.max(f.startOffset, startOffset);
    const inRangeEndOffset = Math.min(f.endOffset, endOffset);

    if (inRangeEndOffset < startOffset || inRangeStartOffset >= endOffset) {
      return null;
    }

    const hasHead = f.startOffset >= startOffset && f.startOffset < endOffset;
    const hasTail = f.endOffset <= endOffset;

    const freezeOffset = `calc(var(--arrow-size) / 2)`;

    return (
      <div
        key={`${f.startOffset}-${f.direction}`}
        className={styles.freeze}
        style={{
          top: `calc((${inRangeStartOffset - startOffset}) * ${measureHeight} + ${
            hasHead ? `${freezeOffset} + ${arrowAdjustment}` : "0px"
          })`,
          left: `calc(${f.direction} * var(--arrow-size))`,
          width: "var(--arrow-size)",
          height: `calc((${
            inRangeEndOffset - inRangeStartOffset
          }) * ${measureHeight} - ${
            hasTail && hasHead ? arrowAdjustment : "0px"
          } - ${hasHead ? `(${freezeOffset} * ${speedMod})` : "0px"})`,
        }}
      >
        <FreezeBody includeTail={hasTail} direction={f.direction} />
      </div>
    );
  });

  const bpmRangeDivs = [];
  const bpmLabelDivs = [];
  const timeLabelDivs = [];
  const bpmMarkerOffsets = [];

  if (bpm.length > 1) {
    for (let i = 0; i < bpm.length; ++i) {
      const b = bpm[i];

      const inRangeStartOffset = Math.max(b.startOffset, startOffset);
      const inRangeEndOffset = Math.min(b.endOffset ?? endOffset, endOffset);

      if (inRangeStartOffset >= endOffset) {
        break;
      }

      if (inRangeEndOffset < startOffset) {
        continue;
      }

      const even = (i & 1) === 0;

      const normalizedStartOffset = Math.max(0, b.startOffset);

      const startsInThisSection =
        normalizedStartOffset >= startOffset &&
        normalizedStartOffset < endOffset;

      bpmRangeDivs.push(
        <div
          key={b.startOffset}
          className={clsx(styles.bpmRange, {
            [styles.bpmRangeBorder]: startsInThisSection,
            [styles.bpmRangeEven]: even,
            [styles.bpmRangeOdd]: !even,
          })}
          style={{
            backgroundColor: even ? "transparent" : BPM_RANGE_COLOR,
            top: `calc(${inRangeStartOffset - startOffset} * ${measureHeight})`,
            height: `calc(${
              inRangeEndOffset - inRangeStartOffset
            } * ${measureHeight})`,
          }}
        />
      );

      if (
        showSideMarkers &&
        normalizedStartOffset >= startOffset &&
        normalizedStartOffset < endOffset
      ) {
        bpmMarkerOffsets.push(normalizedStartOffset);
        bpmLabelDivs.push(
          <div
            key={b.startOffset}
            className={styles.bpmLabel}
            style={{
              top: `calc(${
                inRangeStartOffset - startOffset
              } * ${measureHeight})`,
            }}
          >
            <div
              className={clsx(
                styles.bpmLabelText,
                {
                  [styles.bpmLabelEven]: even,
                  [styles.bpmLabelOdd]: !even,
                }
              )}
            >
              {Math.round(b.bpm)}
            </div>
          </div>
        );
      }
    }
  }

  if (showTimeLabels) {
    const firstTimeOffset =
      Math.ceil(startOffset / TIME_LABEL_INTERVAL_MEASURES) * TIME_LABEL_INTERVAL_MEASURES;
    for (
      let offset = firstTimeOffset;
      offset < endOffset;
      offset += TIME_LABEL_INTERVAL_MEASURES
    ) {
      const seconds = timeAtOffset(bpm, stops, offset);
      const overlapsBpmMarker = bpmMarkerOffsets.some(
        (markerOffset) => Math.abs(markerOffset - offset) < BPM_TIME_COLLISION_EPSILON,
      );
      const top = overlapsBpmMarker
        ? `calc(${offset - startOffset} * ${measureHeight} + ${TIME_LABEL_COLLISION_SHIFT})`
        : `calc(${offset - startOffset} * ${measureHeight})`;
      timeLabelDivs.push(
        <div
          key={`time-${offset}`}
          className={styles.timeLabel}
          style={{ top }}
        >
          <div className={styles.timeLabelText}>{formatTimeLabel(seconds)}</div>
        </div>
      );
    }
  }

  const stopLabels = showSideMarkers
    ? stops.map((s) => {
        if (s.offset < startOffset || s.offset >= endOffset) {
          return null;
        }

        return (
          <GiStopSign
            key={s.offset}
            className={clsx(styles.stopSign)}
            style={{
              top: `calc(${s.offset - startOffset} * ${measureHeight})`,
            }}
          />
        );
      })
    : null;

  const noscriptStyle =
    startOffset === 0 ? (
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: `.${styles.bar}:target, .${styles.targeted} { scroll-margin-top: 30vh }`,
          }}
        />
      </noscript>
    ) : null;

  return (
    <>
      {noscriptStyle}
      <div
        className={clsx(className, styles.section)}
        style={style}
      >
        <div
          className={clsx(
            styles.container,
            singleDoubleClass
          )}
          style={
            {
              height: `calc(${Math.ceil(
                endOffset - startOffset
              )} * ${measureHeight})`,
            }
          }
        >
          {barDivs}
          {bpmRangeDivs}
          {freezeDivs}
          {!isSingle && (
            <div className={clsx(styles.doubleDivider, "h-full")} />
          )}
          {arrowImgs}
        </div>
        {bpmLabelDivs}
        {timeLabelDivs}
        {stopLabels}
      </div>
    </>
  );
}

export { StepchartSection };
