import React from 'react';
import './DifficultyMeter.css';
import { difficultyMap } from '../utils/difficulties.js';
import clsx from 'clsx';

export const DifficultyMeter = ({ level, difficultyName, isMissing, onClick, isSelected }) => {
    const style = {
        backgroundColor: isMissing ? '#374151' : difficultyMap[difficultyName]?.color || '#9E9E9E',
        color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? 'black' : 'white',
        cursor: isMissing ? 'default' : 'pointer',
        border: isSelected ? '2px solid white' : '2px solid transparent',
        boxShadow: isSelected ? `inset 0 0 8px rgba(0,0,0,0.2)` : 'none',
        boxSizing: 'border-box',
       
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
        <div className={clsx('difficulty-meter', hasDecimal && 'decimal')} style={style} onClick={onClick}>
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

