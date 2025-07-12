import React from "react";
import clsx from "clsx";

import arrow4Svg from "../assets/arrow4.svg";
import arrow6Svg from "../assets/arrow6.svg";
import arrow8Svg from "../assets/arrow8.svg";
import arrow16Svg from "../assets/arrow16.svg";
import arrowShockSvg from "../assets/arrowShock.svg";
import arrowFreezeSvg from "../assets/arrowFreeze.svg";

import styles from "./ArrowImg.module.css";

const arrowClasses = {
  0: styles.left1,
  1: styles.down1,
  2: styles.up1,
  3: styles.right1,
  4: styles.left2,
  5: styles.down2,
  6: styles.up2,
  7: styles.right2,
};

const arrowImgs = {
  4: arrow4Svg,
  6: arrow6Svg,
  8: arrow8Svg,
  12: arrow6Svg,
  16: arrow16Svg,
  shock: arrowShockSvg,
  freeze: arrowFreezeSvg,
};

function ArrowImg({ className, style, position, beat }) {
  return (
    <img
      className={clsx(
        className,
        styles.arrowSvg,
        arrowClasses[position],
        "pointer-events-none"
      )}
      style={style}
      src={arrowImgs[beat]}
      alt={`${beat} arrow`}
      data-beat={beat}
    />
  );
}

export { ArrowImg };