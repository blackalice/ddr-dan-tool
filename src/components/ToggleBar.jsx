import React from "react";
import clsx from "clsx";
import styles from "./ToggleBar.module.css";

function ToggleBar({
  className,
  namespace,
  entries,
  entryWidth = "5rem",
  onToggle,
  checkedIndex,
}) {
  const style = { "--entry-width": entryWidth };

  return (
    <div className={clsx(className, styles.root)} style={style}>
      {entries.map((entry, i) => {
        const id = `toggle-${namespace}-${i}`;
        return (
          <React.Fragment key={id}>
            <input
              type="radio"
              name={namespace}
              id={id}
              checked={i === checkedIndex}
              onChange={() => onToggle(i)}
              className={styles.radioInput}
            />
            <label htmlFor={id} className={styles.label}>{entry}</label>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { ToggleBar };
