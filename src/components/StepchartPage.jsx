import React, { useEffect, useState } from "react";
import clsx from "clsx";

import { ImageFrame } from "./ImageFrame";
import { Breadcrumbs } from "./Breadcrumbs";
import { TitleDetailsTable, TitleDetailsRow } from "./TitleDetailsTable";
import { ToggleBar } from "./ToggleBar";
import { Banner } from "./Banner";
import { StepchartSection, scrollTargetBeatJustUnderHeader } from "./StepchartSection";
import styles from "./StepchartPage.module.css";

const speedmods = [1, 1.5, 2, 3];
const sectionSizesInMeasures = {
  1: 8,
  1.5: 5,
  2: 4,
  3: 3,
};

const HEADER_ID = "stepchart-page-header";

function StepchartPage({ simfile, currentType }) {
  useEffect(() => {
    const hash = (window.location.hash ?? "").replace("#", "");
    if (hash) {
      scrollTargetBeatJustUnderHeader(hash, HEADER_ID);
    }
  }, []);

  const [currentUrl, setCurrentUrl] = useState(null);

  useEffect(() => {
    setCurrentUrl(window.location.toString());
  }, []);

  const [speedmod, setSpeedmod] = useState(speedmods[0]);
  const sectionSizeInMeasures = sectionSizesInMeasures[speedmod];

  const isSingle = currentType.includes("single");
  const currentTypeMeta = simfile.availableTypes.find(
    (at) => at.slug === currentType
  );

  if (!currentTypeMeta) {
    return <div>Difficulty '{currentType}' not found in simfile.</div>;
  }

  const chart = simfile.charts[currentType];
  if (!chart) {
    return <div>Chart not found for {currentType}</div>;
  }
  const { arrows, freezes } = chart;

  const lastArrowOffset = (arrows[arrows.length - 1]?.offset ?? 0) + 0.25;
  const lastFreezeOffset = freezes.length > 0 ? freezes[freezes.length - 1]?.endOffset ?? 0 : 0;
  const totalSongHeight = Math.max(lastArrowOffset, lastFreezeOffset);

  const sections = [];

  for (let i = 0; i < totalSongHeight; i += sectionSizeInMeasures) {
    sections.push(
      <StepchartSection
        key={i}
        chart={chart}
        speedMod={speedmod}
        startOffset={i}
        endOffset={Math.min(totalSongHeight, i + sectionSizeInMeasures)}
        style={{ zIndex: Math.round(totalSongHeight) - i }}
        headerId={HEADER_ID}
      />
    );
  }

  const sectionGroups = [];
  const sectionsPerChunk = isSingle ? 7 : 4;

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

  return (
    <div className={styles.rootPrint}>
      {/* Root component from stepcharts-main is complex, I'll just use a div for now and focus on the page content */}
      <div
        className={clsx(
          styles.aboveStepChart,
          styles.mobileHeader
        )}
      >
        <a href="..">
          <Banner
            className={clsx(
              styles.hideForPrint,
              styles.mobileBanner
            )}
            title={simfile.title}
          />
        </a>
      </div>
      <ImageFrame
        id={HEADER_ID}
        className={clsx(
          styles.hideForPrint,
          styles.aboveStepChart,
          styles.desktopHeader
        )}
      >
        <div className={styles.detailsContainer}>
          <TitleDetailsTable>
            {simfile.title.translitTitleName && (
              <TitleDetailsRow
                name="Native title"
                value={simfile.title.titleName}
              />
            ) || null}
            <TitleDetailsRow name="BPM" value={simfile.displayBpm} />
            <TitleDetailsRow
              name="Artist"
              value={simfile.artist ?? "unknown"}
            />
            <TitleDetailsRow name="Mix" value={simfile.mix.mixName} />
            <TitleDetailsRow
              name="difficulty"
              value={`${currentTypeMeta.difficulty} (${currentTypeMeta.feet})`}
            />
          </TitleDetailsTable>
        </div>
        <div className={styles.speedmodContainer}>
          <div className={styles.speedmodLabel}>speedmod</div>
          <ToggleBar
            namespace="speedmod"
            entries={speedmods.map((sm) => (
              <div key={sm}>{sm}</div>
            ))}
            onToggle={(i) => setSpeedmod(speedmods[i])}
            checkedIndex={speedmods.indexOf(speedmod)}
          />
        </div>
      </ImageFrame>
      <div className={styles.printTitle}>
        <div>
          {simfile.mix.mixName}: {title}
        </div>
        {currentUrl && (
          <div className={styles.printUrl}>{currentUrl}</div>
        )}
      </div>
      {sectionGroups}
    </div>
  );
}

export { StepchartPage };
