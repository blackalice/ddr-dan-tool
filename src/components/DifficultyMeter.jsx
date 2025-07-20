import React from 'react';
import './DifficultyMeter.css';
import { difficultyMap } from '../utils/difficulties.js';
import clsx from 'clsx';

export const DifficultyMeter = ({ level, difficultyName, isMissing, onClick, isSelected }) => {
    const style = {
        backgroundColor: isMissing ? '#374151' : difficultyMap[difficultyName]?.color || '#9E9E9E',
        color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? '#111827' : 'white',
        cursor: isMissing ? 'default' : 'pointer',
        border: isSelected ? '2px solid white' : '2px solid transparent',
        boxSizing: 'border-box',
    };

    const hasDecimal = typeof level === 'number' && level % 1 !== 0;
    let integerPart = level;
    let decimalPart = null;

    if (hasDecimal) {
        const levelStr = level.toString();
        const decimalIndex = levelStr.indexOf('.');
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

