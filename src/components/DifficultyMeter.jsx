import React from 'react';

const difficultyMap = {
    'Beginner': { color: '#4DB6AC' },
    'Basic': { color: '#FDD835' },
    'Difficult': { color: '#F44336' },
    'Expert': { color: '#8BC34A' },
    'Challenge': { color: '#BA68C8' },
};

const difficultyNameMapping = {
    'Beginner': ['Beginner'],
    'Basic': ['Basic', 'Easy', 'Light'],
    'Difficult': ['Difficult', 'Medium', 'Standard'],
    'Expert': ['Expert', 'Hard', 'Heavy'],
    'Challenge': ['Challenge', 'Oni']
};

const DifficultyMeter = ({ level, difficultyName, isMissing, onClick, isSelected }) => {
    const style = {
        backgroundColor: isMissing ? '#374151' : difficultyMap[difficultyName]?.color || '#9E9E9E',
        color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? '#111827' : 'white',
        cursor: onClick ? 'pointer' : 'default',
        outline: isSelected ? '2px solid var(--accent-color)' : 'none',
        outlineOffset: '2px',
    };
    return (
        <div className="difficulty-meter" style={style} onClick={onClick}>
            {level}
        </div>
    );
};

export { DifficultyMeter, difficultyLevels, difficultyNameMapping };

const difficultyLevels = Object.keys(difficultyMap);
