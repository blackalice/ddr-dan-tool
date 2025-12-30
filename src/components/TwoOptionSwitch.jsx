import React, { useMemo } from "react";
import clsx from "clsx";
import styles from "./TwoOptionSwitch.module.css";

const TwoOptionSwitch = ({
  options = [],
  value,
  onChange,
  ariaLabel,
  className,
  disabled = false,
}) => {
  const [left, right] = options;
  const activeIndex = useMemo(() => {
    const index = options.findIndex((option) => option.value === value);
    return index === 1 ? 1 : 0;
  }, [options, value]);

  if (!left || !right) return null;

  return (
    <div
      className={clsx(styles.root, className, disabled && styles.rootDisabled)}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ "--thumb-position": activeIndex === 1 ? "100%" : "0%" }}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((option, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            className={clsx(styles.option, isActive && styles.optionActive)}
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export { TwoOptionSwitch };
