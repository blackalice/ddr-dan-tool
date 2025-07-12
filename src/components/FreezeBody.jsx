import React from "react";
import clsx from "clsx";

import styles from "./FreezeBody.module.css";

function FreezeBody({
  className,
  style,
  includeTail,
  direction,
}) {
  return (
    <div
      className={clsx(className, styles.root, {
        [styles[`withTail_${direction}`]]: includeTail,
        [styles.withoutTail]: !includeTail,
      })}
      style={style}
    />
  );
}

export { FreezeBody };