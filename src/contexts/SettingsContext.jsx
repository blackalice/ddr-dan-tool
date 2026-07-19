/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useMemo } from 'react';
import { getMultipliers, MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS, normalizeSonglistOverrideValue } from '../utils/songlistOverrides';
import { storage } from '../utils/remoteStorage.js';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const [targetBPM, setTargetBPM] = useState(() => {
        const saved = storage.getItem('targetBPM');
        return saved ? parseInt(saved, 10) : 300;
    });

    const [multiplierMode, setMultiplierMode] = useState(() => {
        const saved = storage.getItem('multiplierMode');
        return saved || MULTIPLIER_MODES.A_A3;
    });

    const [theme, setTheme] = useState(() => {
        const saved = storage.getItem('theme');
        return saved || 'new';
    });

    const [playStyle, setPlayStyle] = useState(() => {
        const saved = storage.getItem('playStyle');
        return saved || 'single';
    });

    const [songlistOverride, setSonglistOverride] = useState(() => {
        const saved = storage.getItem('songlistOverride');
        return normalizeSonglistOverrideValue(saved) || SONGLIST_OVERRIDE_OPTIONS[0].value;
    });
    const setNormalizedSonglistOverride = useMemo(
        () => (value) => setSonglistOverride(normalizeSonglistOverrideValue(value)),
        [],
    );

    const [showMultiplierIncrementVersion, setShowMultiplierIncrementVersion] = useState(() => {
        const saved = storage.getItem('showMultiplierIncrementVersion');
        return saved ? JSON.parse(saved) : false;
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

    // Beta: Toggle to show Vega Rankings (off by default)
    const [showVegaBeta, setShowVegaBeta] = useState(() => {
        const saved = storage.getItem('showVegaBeta');
        return saved ? JSON.parse(saved) : false;
    });

    const [showTransliterationBeta, setShowTransliterationBeta] = useState(() => {
        const saved = storage.getItem('showTransliterationBeta');
        return saved ? JSON.parse(saved) : false;
    });

    const [showWipStats, setShowWipStats] = useState(() => {
        const saved = storage.getItem('showWipStats');
        return saved ? JSON.parse(saved) : false;
    });

    const [cardDrawTournamentLabels, setCardDrawTournamentLabels] = useState(() => {
        const saved = storage.getItem('cardDrawCurrentLabels');
        if (!saved) return { round: '', p1: 'P1', p2: 'P2' };
        try {
            const parsed = JSON.parse(saved);
            return parsed && typeof parsed === 'object'
                ? parsed
                : { round: '', p1: 'P1', p2: 'P2' };
        } catch {
            return { round: '', p1: 'P1', p2: 'P2' };
        }
    });

    const [cardDrawTournamentLabelLocks, setCardDrawTournamentLabelLocks] = useState(() => {
        const saved = storage.getItem('cardDrawTournamentLabelLocks');
        if (!saved) return { round: false, p1: false, p2: false };
        try {
            const parsed = JSON.parse(saved);
            return parsed && typeof parsed === 'object'
                ? {
                    round: parsed.round === true,
                    p1: parsed.p1 === true || parsed.players === true,
                    p2: parsed.p2 === true || parsed.players === true,
                }
                : { round: false, p1: false, p2: false };
        } catch {
            return { round: false, p1: false, p2: false };
        }
    });

    // Beta: Dim draws outside the current viewport focus (off by default)
    const [showDrawFocusBeta, setShowDrawFocusBeta] = useState(() => {
        const saved = storage.getItem('showDrawFocusBeta');
        return saved ? JSON.parse(saved) : false;
    });

    const [worldDifficultyChanges, setWorldDifficultyChanges] = useState(() => {
        const saved = storage.getItem('worldDifficultyChanges');
        return saved ? JSON.parse(saved) : false;
    });

    const [worldRemoveChallengeCharts, setWorldRemoveChallengeCharts] = useState(() => {
        const saved = storage.getItem('worldRemoveChallengeCharts');
        if (saved != null) return JSON.parse(saved);
        const legacy = storage.getItem('worldNewChallengeCharts');
        if (legacy != null) {
            return !JSON.parse(legacy);
        }
        return false;
    });

    useEffect(() => {
        storage.setItem('targetBPM', targetBPM);
    }, [targetBPM]);

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
        storage.setItem('showMultiplierIncrementVersion', JSON.stringify(showMultiplierIncrementVersion));
    }, [showMultiplierIncrementVersion]);

    useEffect(() => {
        storage.setItem('showCoursesBeta', JSON.stringify(showCoursesBeta));
    }, [showCoursesBeta]);

    useEffect(() => {
        storage.setItem('showVegaBeta', JSON.stringify(showVegaBeta));
    }, [showVegaBeta]);

    useEffect(() => {
        storage.setItem('showTransliterationBeta', JSON.stringify(showTransliterationBeta));
    }, [showTransliterationBeta]);

    useEffect(() => {
        storage.setItem('showWipStats', JSON.stringify(showWipStats));
    }, [showWipStats]);

    useEffect(() => {
        storage.setItem('showDrawFocusBeta', JSON.stringify(showDrawFocusBeta));
    }, [showDrawFocusBeta]);

    useEffect(() => {
        storage.setItem('cardDrawCurrentLabels', JSON.stringify(cardDrawTournamentLabels));
    }, [cardDrawTournamentLabels]);

    useEffect(() => {
        storage.setItem('cardDrawTournamentLabelLocks', JSON.stringify(cardDrawTournamentLabelLocks));
    }, [cardDrawTournamentLabelLocks]);

    useEffect(() => {
        storage.setItem('worldDifficultyChanges', JSON.stringify(worldDifficultyChanges));
    }, [worldDifficultyChanges]);

    useEffect(() => {
        storage.setItem('worldRemoveChallengeCharts', JSON.stringify(worldRemoveChallengeCharts));
    }, [worldRemoveChallengeCharts]);

    const multipliers = useMemo(() => getMultipliers(multiplierMode), [multiplierMode]);

    const value = {
        targetBPM,
        setTargetBPM,
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
        showVegaBeta,
        setShowVegaBeta,
        showTransliterationBeta,
        setShowTransliterationBeta,
        showWipStats,
        setShowWipStats,
        showDrawFocusBeta,
        setShowDrawFocusBeta,
        cardDrawTournamentLabels,
        setCardDrawTournamentLabels,
        cardDrawTournamentLabelLocks,
        setCardDrawTournamentLabelLocks,
        songlistOverride,
        setSonglistOverride: setNormalizedSonglistOverride,
        showMultiplierIncrementVersion,
        setShowMultiplierIncrementVersion,
        worldDifficultyChanges,
        setWorldDifficultyChanges,
        worldRemoveChallengeCharts,
        setWorldRemoveChallengeCharts,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
