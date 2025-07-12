import React, { CSSProperties, useEffect, useState } from "react";
import clsx from "clsx";
import { FreezeBody } from "./FreezeBody";
import { GiStopSign } from "react-icons/gi";
import { FiLink } from "react-icons/fi";
import { ArrowImg } from "./ArrowImg";

import styles from "./StepchartSection.module.css";

const BPM_RANGE_COLOR = "rgba(100, 0, 60, 0.115)";

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
  headerId,
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
    return null; // Don't render anything if there are no notes in this section
  }

  const isSingle = arrows.length > 0 ? arrows[0].direction.length === 4 : freezes[0].direction < 4;
  const singleDoubleClass = isSingle ? "single" : "double";

  const barHeight = `var(--arrow-size) * ${speedMod}`;
  const measureHeight = `${barHeight} * 4`;
  const arrowAdjustment = `(${barHeight} - var(--arrow-size)) / 2`;

  const arrowImgs = [];

  for (let ai = arrows.length - 1; ai >= 0; --ai) {
    const a = arrows[ai];

    if (a.offset >= endOffset) {
      continue;
    }

    if (a.offset < startOffset) {
      break;
    }

    const isShockArrow = a.direction.indexOf("0") === -1;
    const isFreezeArrow = a.direction.indexOf("2") > -1;

    for (let i = 0; i < a.direction.length; ++i) {
      if (a.direction[i] !== "0") {
        arrowImgs.push(
          <ArrowImg
            key={`Arrow-${ai}-${i}`}
            className={clsx(styles.arrow, "absolute text-xs ease-in-out")}
            style={{
              top: `calc((${a.offset} - ${startOffset}) * ${measureHeight} + ${arrowAdjustment})`,
            }}
            position={i}
            beat={isShockArrow ? "shock" : isFreezeArrow ? "freeze" : a.beat}
          />
        );
      }
    }
  }

  const barDivs = [];

  for (let i = 0; i < Math.ceil(endOffset - startOffset) / 0.25; ++i) {
    const id = `beat-${(startOffset + i * 0.25) * 4 + 1}`;
    const height = `calc(${barHeight})`;

    barDivs.push(
      <div
        key={id}
        id={id}
        className={clsx(styles.bar, {
          "border-b-2 border-indigo-400": (i + 1) % 4 === 0,
          "border-b border-blue-500 border-dashed": (i + 1) % 4 !== 0,
          [styles.targeted]: id === targetedBeat,
        })}
        style={{
          height,
        }}
      >
        <SelfLink
          id={id}
          style={{ height }}
          onClick={() => {
            setTargetedBeat(id);
            scrollTargetBeatJustUnderHeader(id, headerId);
          }}
        />
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

    const freezeOffset = `var(--arrow-size) / 2`;

    return (
      <div
        key={`${f.startOffset}-${f.direction}`}
        className="absolute pointer-events-none overflow-hidden"
        style={{
          top: `calc(${inRangeStartOffset - startOffset}  * ${measureHeight} ${
            hasHead ? `+ ${freezeOffset} + ${arrowAdjustment}` : ""
          })`,
          left: `calc(${f.direction} * var(--arrow-size))`,
          width: "var(--arrow-size)",
          height: `calc(${
            inRangeEndOffset - inRangeStartOffset
          } * ${measureHeight} ${
            hasTail && hasHead ? `- ${arrowAdjustment}` : ""
          } ${hasHead ? `- ${freezeOffset} * ${speedMod}` : ""})`,
        }}
      >
        <FreezeBody includeTail={hasTail} direction={f.direction} />
      </div>
    );
  });

  const bpmRangeDivs = [];
  const bpmLabelDivs = [];

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
          className={clsx("absolute left-0 w-full pointer-events-none", {
            "border-t": startsInThisSection,
            "border-blue-500": even,
            "border-difficult": !even,
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
        normalizedStartOffset >= startOffset &&
        normalizedStartOffset < endOffset
      ) {
        bpmLabelDivs.push(
          <div
            key={b.startOffset}
            className="absolute flex flex-row justify-end pointer-events-none"
            style={{
              top: `calc(${
                inRangeStartOffset - startOffset
              } * ${measureHeight})`,
              left: -100,
              width: 100,
            }}
          >
            <div
              className={clsx(
                styles.bpmLabelText,
                "text-white p-0.5 rounded-l-lg",
                {
                  "bg-blue-500": even,
                  "bg-difficult": !even,
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

  const stopLabels = stops.map((s) => {
    if (s.offset < startOffset || s.offset >= endOffset) {
      return null;
    }

    return (
      <GiStopSign
        key={s.offset}
        className={clsx(styles.stopSign, "text-red-600 absolute")}
        style={{
          top: `calc(${s.offset - startOffset} * ${measureHeight})`,
        }}
      />
    );
  });

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
        className={clsx(className, "relative", {
          "border-b-4 border-yellow-400": process.env.NODE_ENV !== "production",
        })}
        style={style}
      >
        <div
          className={clsx(
            styles.container,
            styles[`container-${singleDoubleClass}`],
            "relative bg-indigo-100 z-10"
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
        {stopLabels}
      </div>
    </>
  );
}

export { StepchartSection, scrollTargetBeatJustUnderHeader };