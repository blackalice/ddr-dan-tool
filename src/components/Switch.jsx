import React from "react";
import styles from "./Switch.module.css";

export const Switch = ({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className = "",
}) => {
  const classes = [styles.switch, className].filter(Boolean).join(" ");
  return (
    <label className={classes}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      <span className={styles.track}>
        <span className={styles.thumb} />
      </span>
    </label>
  );
};
