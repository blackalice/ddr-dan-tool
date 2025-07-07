import React, { createContext, useState, useEffect, useMemo } from 'react';
import { getMultipliers, MULTIPLIER_MODES } from '../utils/multipliers';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const [targetBPM, setTargetBPM] = useState(() => {
        const saved = localStorage.getItem('targetBPM');
        return saved ? parseInt(saved, 10) : 300;
    });

    const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('geminiApiKey') || '');

    const [multiplierMode, setMultiplierMode] = useState(() => {
        const saved = localStorage.getItem('multiplierMode');
        return saved || MULTIPLIER_MODES.ONLINE;
    });

    useEffect(() => {
        localStorage.setItem('targetBPM', targetBPM);
    }, [targetBPM]);

    useEffect(() => {
        sessionStorage.setItem('geminiApiKey', apiKey);
    }, [apiKey]);

    useEffect(() => {
        localStorage.setItem('multiplierMode', multiplierMode);
    }, [multiplierMode]);

    const multipliers = useMemo(() => getMultipliers(multiplierMode), [multiplierMode]);

    const value = {
        targetBPM,
        setTargetBPM,
        apiKey,
        setApiKey,
        multiplierMode,
        setMultiplierMode,
        multipliers,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
