import React from 'react';
import clsx from 'clsx';
import styles from './ToggleBar.module.css';

function ToggleBar({
  className,
  namespace,
  options = [], // Expects an array of objects: [{ value: 'val', label: 'Label' }]
  value,   // The currently selected value
  onChange, // Function to call when a new value is selected
  entryWidth = '5rem',
}) {
  const style = { '--entry-width': entryWidth };

  return (
    <div className={clsx(className, styles.root)} style={style}>
      {options.map((option, i) => {
        const id = `toggle-${namespace}-${option.value}`;
        return (
          <React.Fragment key={id}>
            <input
              type="radio"
              name={namespace}
              id={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className={styles.radioInput}
            />
            <label htmlFor={id} className={styles.label}>
              {option.label}
            </label>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { ToggleBar };
