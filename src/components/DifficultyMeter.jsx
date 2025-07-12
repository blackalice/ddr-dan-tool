import React from 'react';
import './DifficultyMeter.css';

export const difficultyMap = {
    'Beginner': { color: '#4DB6AC' },
    'Basic': { color: '#FDD835' },
    'Difficult': { color: '#F44336' },
    'Expert': { color: '#8BC34A' },
    'Challenge': { color: '#BA68C8' },
};

export const difficultyLevels = ['Beginner', 'Basic', 'Difficult', 'Expert', 'Challenge'];

export const difficultyNameMapping = {
    'Beginner': ['beginner'],
    'Basic': ['basic', 'easy', 'light'],
    'Difficult': ['difficult', 'medium', 'standard'],
    'Expert': ['expert', 'hard', 'heavy'],
    'Challenge': ['challenge', 'oni'],
};

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