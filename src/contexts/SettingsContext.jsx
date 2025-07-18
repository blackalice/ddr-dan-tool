/* eslint react-refresh/only-export-components: off */
import React, { createContext, useState, useEffect, useMemo, useContext } from 'react';
import { AuthContext } from './AuthContext.jsx';
import { getMultipliers, MULTIPLIER_MODES } from '../utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from '../utils/songlistOverrides';

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
    const { token } = useContext(AuthContext);

    const defaultState = {
        targetBPM: 300,
        apiKey: '',
        multiplierMode: MULTIPLIER_MODES.A_A3,
        theme: 'dark',
        playStyle: 'single',
        songlistOverride: SONGLIST_OVERRIDE_OPTIONS[0].value,
        showLists: false,
    };

    const [targetBPM, setTargetBPM] = useState(defaultState.targetBPM);
    const [apiKey, setApiKey] = useState(defaultState.apiKey);
    const [multiplierMode, setMultiplierMode] = useState(defaultState.multiplierMode);
    const [theme, setTheme] = useState(defaultState.theme);
    const [playStyle, setPlayStyle] = useState(defaultState.playStyle);
    const [songlistOverride, setSonglistOverride] = useState(defaultState.songlistOverride);
    const [showLists, setShowLists] = useState(defaultState.showLists);

    const applySettings = (data) => {
        if (data.targetBPM !== undefined) setTargetBPM(data.targetBPM);
        if (data.multiplierMode) setMultiplierMode(data.multiplierMode);
        if (data.theme) setTheme(data.theme);
        if (data.playStyle) setPlayStyle(data.playStyle);
        if (data.showLists !== undefined) setShowLists(data.showLists);
        if (data.songlistOverride) setSonglistOverride(data.songlistOverride);
        if (data.apiKey) setApiKey(data.apiKey);
    };

    const resetSettings = () => {
        setTargetBPM(defaultState.targetBPM);
        setApiKey(defaultState.apiKey);
        setMultiplierMode(defaultState.multiplierMode);
        setTheme(defaultState.theme);
        setPlayStyle(defaultState.playStyle);
        setSonglistOverride(defaultState.songlistOverride);
        setShowLists(defaultState.showLists);
    };

    const saveSettings = async (settingsToSave) => {
        if (!token) return;
        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(settingsToSave),
            });
        } catch (err) {
            console.error('Failed to save settings', err);
        }
    };

    const loadSettings = async () => {
        if (!token) {
            resetSettings();
            return;
        }
        try {
            const res = await fetch('/api/settings', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                if (Object.keys(data).length > 0) {
                    applySettings(data);
                }
            }
        } catch (err) {
            console.error('Failed to load settings', err);
        }
    };

    useEffect(() => {
        if (token) {
            loadSettings();
        }
    }, [token]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

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
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
