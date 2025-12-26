import React, { useState, useContext } from "react";
import clsx from "clsx";
import styles from "./Banner.module.css";
import { SettingsContext } from "../contexts/SettingsContext.jsx";

function Banner({ className, title }) {
  const { showTransliterationBeta } = useContext(SettingsContext);
  const name = showTransliterationBeta && title.translitTitleName
    ? title.translitTitleName
    : title.titleName;
  const [currentBanner, setCurrentBanner] = useState(title.banner);

  let bannerEl;

  if (currentBanner) {
    bannerEl = (
      <img
        className={styles.bannerImage}
        src={`/bannerImages/${currentBanner}`}
        onError={() => setCurrentBanner(null)}
        loading="lazy"
        alt={`${name} banner`}
      />
    );
  } else {
    bannerEl = (
      <div className={styles.fallbackContainer}>
        <div className={styles.fallbackTitle}>{name}</div>
        <div className={styles.fallbackSubtitle}>(banner missing)</div>
      </div>
    );
  }

  return (
    <div
      className={clsx(className, styles.bannerContainer)}
      style={{
        paddingTop: "calc(80 / 256 * 100%)",
      }}
    >
      {bannerEl}
    </div>
  );
}

export { Banner };
