import React from 'react';
import './DifficultyMeter.css';
import { difficultyMap } from '../utils/difficulties.js';
import clsx from 'clsx';

export const DifficultyMeter = ({ level, difficultyName, isMissing, onClick, isSelected }) => {
const baseInnerGlow = 'inset 0 0 4px rgb(255, 255, 255)';
const difficultyColorVars = {
  Beginner: '--difficulty-beginner-color',
  Basic: '--difficulty-light-color',
  Difficult: '--difficulty-standard-color',
  Expert: '--difficulty-heavy-color',
  Challenge: '--difficulty-challenge-color',
};
const fallbackColor = difficultyMap[difficultyName]?.color || '#9E9E9E';
const difficultyColor = difficultyColorVars[difficultyName]
  ? `var(${difficultyColorVars[difficultyName]}, ${fallbackColor})`
  : fallbackColor;

const style = {
  '--difficulty-color': difficultyColor,
  backgroundColor: isMissing ? 'var(--card-hover-bg-color-light, #374151)' : difficultyColor,
  color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? 'black' : 'white',
  cursor: isMissing ? 'default' : 'pointer',

  padding: '0.6rem',
  boxSizing: 'border-box',

  // no border at all
  border: '0',

  boxShadow: isSelected
    ? `inset 0 0 0 2px white, inset 0 0 8px rgba(0,0,0,0.2), ${baseInnerGlow}`
    : baseInnerGlow,
};

    const levelStr = level == null ? '' : String(level);
    const decimalIndex = levelStr.indexOf('.');
    const hasDecimal = decimalIndex !== -1;
    let integerPart = levelStr;
    let decimalPart = null;

    if (hasDecimal) {
        integerPart = levelStr.substring(0, decimalIndex);
        decimalPart = levelStr.substring(decimalIndex);
    }

    return (
        <div
          className={clsx(
            'difficulty-meter',
            hasDecimal && 'decimal',
            isMissing && 'is-missing',
            isSelected && 'is-selected',
          )}
          style={style}
          onClick={onClick}
        >
            {hasDecimal ? (
                <>
                    {integerPart}
                    <span className="decimal-part">{decimalPart}</span>
                </>
            ) : (
                level
            )}
        </div>
    );
};

