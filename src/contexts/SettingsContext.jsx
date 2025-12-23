/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useMemo } from 'react';
import { getMultipliers, MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides';
import { storage } from '../utils/remoteStorage.js';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const [targetBPM, setTargetBPM] = useState(() => {
        const saved = storage.getItem('targetBPM');
        return saved ? parseInt(saved, 10) : 300;
    });

    const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('geminiApiKey') || '');

    const [multiplierMode, setMultiplierMode] = useState(() => {
        const saved = storage.getItem('multiplierMode');
        return saved || MULTIPLIER_MODES.A_A3;
    });

    const [theme, setTheme] = useState(() => {
        const saved = storage.getItem('theme');
        return saved || 'dark';
    });

    const [playStyle, setPlayStyle] = useState(() => {
        const saved = storage.getItem('playStyle');
        return saved || 'single';
    });

    const [songlistOverride, setSonglistOverride] = useState(() => {
        const saved = storage.getItem('songlistOverride');
        return saved || SONGLIST_OVERRIDE_OPTIONS[0].value;
    });

    const [showLists] = useState(true);

    const [showRankedRatings, setShowRankedRatings] = useState(() => {
        const saved = storage.getItem('showRankedRatings');
        return saved ? JSON.parse(saved) : false;
    });

    // Beta: Toggle to show Courses tab (off by default)
    const [showCoursesBeta, setShowCoursesBeta] = useState(() => {
        const saved = storage.getItem('showCoursesBeta');
        return saved ? JSON.parse(saved) : false;
    });

    const [worldDifficultyChanges, setWorldDifficultyChanges] = useState(() => {
        const saved = storage.getItem('worldDifficultyChanges');
        return saved ? JSON.parse(saved) : false;
    });

    useEffect(() => {
        storage.setItem('targetBPM', targetBPM);
    }, [targetBPM]);

    useEffect(() => {
        sessionStorage.setItem('geminiApiKey', apiKey);
    }, [apiKey]);

    useEffect(() => {
        storage.setItem('multiplierMode', multiplierMode);
    }, [multiplierMode]);

    useEffect(() => {
        storage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        storage.setItem('playStyle', playStyle);
    }, [playStyle]);

    // showLists is always enabled; no persistence needed

    useEffect(() => {
        storage.setItem('showRankedRatings', JSON.stringify(showRankedRatings));
    }, [showRankedRatings]);

    useEffect(() => {
        storage.setItem('songlistOverride', songlistOverride);
    }, [songlistOverride]);

    useEffect(() => {
        storage.setItem('showCoursesBeta', JSON.stringify(showCoursesBeta));
    }, [showCoursesBeta]);

    useEffect(() => {
        storage.setItem('worldDifficultyChanges', JSON.stringify(worldDifficultyChanges));
    }, [worldDifficultyChanges]);

    const multipliers = useMemo(() => getMultipliers(multiplierMode), [multiplierMode]);

    const value = {
        targetBPM,
        setTargetBPM,
        apiKey,
        setApiKey,
        multiplierMode,
        setMultiplierMode,
        multipliers,
        theme,
        setTheme,
        playStyle,
        setPlayStyle,
        showLists,
        showRankedRatings,
        setShowRankedRatings,
        showCoursesBeta,
        setShowCoursesBeta,
        songlistOverride,
        setSonglistOverride,
        worldDifficultyChanges,
        setWorldDifficultyChanges,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
