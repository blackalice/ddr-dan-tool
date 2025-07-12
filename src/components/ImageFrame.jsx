import React from "react";
import clsx from "clsx";
import styles from "./ImageFrame.module.css";

function ImageFrame({ className, id, children }) {
  return (
    <div
      id={id}
      className={clsx(className, styles.imageFrame)}
    >
      {children}
    </div>
  );
}

export { ImageFrame };
