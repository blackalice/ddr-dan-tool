/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useMemo, useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { getMultipliers, MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const { token } = useContext(AuthContext);

    const [targetBPM, setTargetBPM] = useState(() => {
        const saved = localStorage.getItem('targetBPM');
        return saved ? parseInt(saved, 10) : 300;
    });

    const [apiKey, setApiKey] = useState(() => sessionStorage.getItem('geminiApiKey') || '');

    const [multiplierMode, setMultiplierMode] = useState(() => {
        const saved = localStorage.getItem('multiplierMode');
        return saved || MULTIPLIER_MODES.A_A3;
    });

    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved || 'dark';
    });

    const [playStyle, setPlayStyle] = useState(() => {
        const saved = localStorage.getItem('playStyle');
        return saved || 'single';
    });

    const [songlistOverride, setSonglistOverride] = useState(() => {
        const saved = localStorage.getItem('songlistOverride');
        return saved || SONGLIST_OVERRIDE_OPTIONS[0].value;
    });

    const [showLists, setShowLists] = useState(() => {
        const saved = localStorage.getItem('showLists');
        return saved ? JSON.parse(saved) : false;
    });

    const applySettings = (data) => {
        if (data.targetBPM !== undefined) setTargetBPM(data.targetBPM);
        if (data.multiplierMode) setMultiplierMode(data.multiplierMode);
        if (data.theme) setTheme(data.theme);
        if (data.playStyle) setPlayStyle(data.playStyle);
        if (data.showLists !== undefined) setShowLists(data.showLists);
        if (data.songlistOverride) setSonglistOverride(data.songlistOverride);
        if (data.apiKey) setApiKey(data.apiKey);
    };

    const saveSettings = async (updated = {}) => {
        if (!token) return;
        const settings = {
            targetBPM,
            apiKey,
            multiplierMode,
            theme,
            playStyle,
            showLists,
            songlistOverride,
            ...updated,
        };
        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(settings),
            });
        } catch (err) {
            console.error('Failed to save settings', err);
        }
    };

    const loadSettings = async () => {
        if (!token) return;
        try {
            const res = await fetch('/api/settings', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                applySettings(data);
            }
        } catch (err) {
            console.error('Failed to load settings', err);
        }
    };

    useEffect(() => {
        loadSettings();
    }, [token]);

    useEffect(() => {
        localStorage.setItem('targetBPM', targetBPM);
        saveSettings({ targetBPM });
    }, [targetBPM]);

    useEffect(() => {
        sessionStorage.setItem('geminiApiKey', apiKey);
        saveSettings({ apiKey });
    }, [apiKey]);

    useEffect(() => {
        localStorage.setItem('multiplierMode', multiplierMode);
        saveSettings({ multiplierMode });
    }, [multiplierMode]);

    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        saveSettings({ theme });
    }, [theme]);

    useEffect(() => {
        localStorage.setItem('playStyle', playStyle);
        saveSettings({ playStyle });
    }, [playStyle]);

    useEffect(() => {
        localStorage.setItem('showLists', JSON.stringify(showLists));
        saveSettings({ showLists });
    }, [showLists]);

    useEffect(() => {
        localStorage.setItem('songlistOverride', songlistOverride);
        saveSettings({ songlistOverride });
    }, [songlistOverride]);

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
        setShowLists,
        songlistOverride,
        setSonglistOverride,
        saveSettings,
        loadSettings,
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
