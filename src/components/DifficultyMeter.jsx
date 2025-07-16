import React from 'react';
import './DifficultyMeter.css';
import { difficultyMap } from '../utils/difficulties.js';

export const DifficultyMeter = ({ level, difficultyName, isMissing, onClick, isSelected }) => {
    const style = {
        backgroundColor: isMissing ? '#374151' : difficultyMap[difficultyName]?.color || '#9E9E9E',
        color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? '#111827' : 'white',
        cursor: isMissing ? 'default' : 'pointer',
        border: isSelected ? '2px solid white' : '2px solid transparent',
        boxSizing: 'border-box',
    };
    return (
        <div className="difficulty-meter" style={style} onClick={onClick}>
            {level}
        </div>
    );
};

