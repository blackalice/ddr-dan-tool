import React, { useState, useContext, useEffect } from 'react';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { MULTIPLIER_MODES } from './utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from './utils/songlistOverrides';
import { similarity } from './utils/stringSimilarity.js';
import ThemeSwitcher from './components/ThemeSwitcher';
import './Settings.css';

const Settings = () => {
    const {
        apiKey,
        setApiKey,
        targetBPM,
        setTargetBPM,
        multiplierMode,
        setMultiplierMode,
        showLists,
        setShowLists,
        showRankedRatings,
        setShowRankedRatings,
        songlistOverride,
        setSonglistOverride,
    } = useContext(SettingsContext);

    const { scores, setScores } = useScores();

    const [songMeta, setSongMeta] = useState([]);
    useEffect(() => {
        fetch('/song-meta.json')
            .then(res => res.json())
            .then(setSongMeta)
            .catch(() => {});
    }, []);

    const handleUploadScores = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data.scores)) return;
            const newScores = { ...scores };
            for (const entry of data.scores) {
                const target = entry.identifier;
                let best = null;
                let bestSim = 0;
                for (const song of songMeta) {
                    const sim = similarity(target, song.title);
                    if (sim > bestSim) { bestSim = sim; best = song; }
                }
                if (best && bestSim > 0.4) {
                    const key = `${best.title.toLowerCase()}-${entry.difficulty.toLowerCase()}`;
                    newScores[key] = { score: entry.score, lamp: entry.lamp };
                }
            }
            setScores(newScores);
        } catch {
            // ignore
        }
    };

    const [htmlPlaytype, setHtmlPlaytype] = useState('SP');

    const importParsedScores = (data) => {
        if (!Array.isArray(data.scores)) return;
        const newScores = { ...scores };
        for (const entry of data.scores) {
            const target = entry.identifier;
            let best = null;
            let bestSim = 0;
            for (const song of songMeta) {
                const sim = similarity(target, song.title);
                if (sim > bestSim) { bestSim = sim; best = song; }
            }
            if (best && bestSim > 0.4) {
                const key = `${best.title.toLowerCase()}-${entry.difficulty.toLowerCase()}`;
                newScores[key] = { score: entry.score, lamp: entry.lamp };
            }
        }
        setScores(newScores);
    };

    const handleUploadHtml = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const html = await file.text();
            const res = await fetch(`/api/parse-scores?playtype=${htmlPlaytype}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/html' },
                body: html,
            });
            if (!res.ok) return;
            const data = await res.json();
            importParsedScores(data);
        } catch {
            // ignore
        }
    };

    const clearScores = () => {
        if (window.confirm('Delete all stored scores?')) {
            setScores({});
        }
    };

    const [newApiKey, setNewApiKey] = useState(apiKey);

    const handleSaveKey = () => {
        setApiKey(newApiKey);
    };

    return (
        <div className="app-container">
            <div className="settings-content">
                <div className="settings-inner-container">
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Target Scroll Speed</h3>
                            <p>
                                Set your preferred scroll speed (e.g., 300) to calculate the best multiplier for each song. This is used across the app to determine the best speed multiplier for your playstyle.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input
                                id="targetBPM"
                                type="number"
                                value={targetBPM}
                                onKeyDown={(e) => {
                                    if (e.key === 'e' || e.key === 'E') {
                                        e.preventDefault();
                                    }
                                }}
                                onChange={(e) => {
                                    if (e.target.value === '') {
                                        setTargetBPM('');
                                        return;
                                    }
                                    let value = parseInt(e.target.value, 10);
                                    if (value < 1) value = 1;
                                    if (value > 1000) value = 1000;
                                    setTargetBPM(value);
                                }}
                                className="settings-input"
                                placeholder="e.g. 300"
                            />
                        </div>
                    </div>
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Multiplier Increment Version</h3>
                            <p>
                                Change the available speed multipliers to match a specific game version.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                value={multiplierMode}
                                onChange={(e) => setMultiplierMode(e.target.value)}
                                className="settings-select"
                            >
                                {Object.values(MULTIPLIER_MODES).map(mode => (
                                    <option key={mode} value={mode}>{mode}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Songlist Override</h3>
                            <p>
                                Only display songs available in a specific game version. This will override the default songlist.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                value={songlistOverride}
                                onChange={(e) => setSonglistOverride(e.target.value)}
                                className="settings-select"
                            >
                                {SONGLIST_OVERRIDE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <ThemeSwitcher />

                    <h2 className="settings-sub-header">Beta Features</h2>

                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Google AI Studio API Key</h3>
                            <p>
                                BETA - Used for the experimental camera feature to identify songs. Your key is stored only in your browser's session storage and is sent directly to Google. Likely to crash on low end devices.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input
                                type="password"
                                value={newApiKey}
                                onChange={(e) => setNewApiKey(e.target.value)}
                                placeholder="Enter your Google AI API Key"
                                className="settings-input"
                            />
                            <button onClick={handleSaveKey} className="settings-button">Save</button>
                        </div>
                    </div>

                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Custom List Function</h3>
                            <p>
                                BETA - Create custom lists of songs, with the abilty to build from custom filters. Maximum 150 songs per list. Your lists are currently stored in your browser and could be lost easily.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                value={showLists ? 'Enable' : 'Disable'}
                                onChange={(e) => setShowLists(e.target.value === 'Enable')}
                                className="settings-select"
                            >
                                <option value="Enable">Enable</option>
                                <option value="Disable">Disable</option>
                            </select>
                        </div>
                    </div>

                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Show Ranked Ratings</h3>
                            <p>
                                Display decimal ranked ratings instead of the standard foot level.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                value={showRankedRatings ? 'Enable' : 'Disable'}
                                onChange={(e) => setShowRankedRatings(e.target.value === 'Enable')}
                                className="settings-select"
                            >
                                <option value="Enable">Enable</option>
                                <option value="Disable">Disable</option>
                            </select>
                        </div>
                    </div>

                    <h2 className="settings-sub-header">Scores</h2>
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Upload Score JSON</h3>
                            <p>
                                Import your DDR scores to display them on the Ranking page. Your browser currently stores {Object.keys(scores).length} scores.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input type="file" accept="application/json" onChange={handleUploadScores} className="settings-input" />
                            <button onClick={clearScores} className="settings-button">Delete Stats</button>
                        </div>
                    </div>
                    <div className="setting-card">
                        <div className="setting-text">
                            <h3>Upload Ganymede HTML</h3>
                            <p>
                                Send a raw HTML dump from the Ganymede website to Cloudflare for parsing. Choose SP or DP to match the table type.
                            </p>
                        </div>
                        <div className="setting-control">
                            <input type="file" accept="text/html" onChange={handleUploadHtml} className="settings-input" />
                            <select value={htmlPlaytype} onChange={(e) => setHtmlPlaytype(e.target.value)} className="settings-select" style={{ marginLeft: '0.5rem' }}>
                                <option value="SP">SP</option>
                                <option value="DP">DP</option>
                            </select>
                        </div>
                    </div>

                    <h2 className="settings-sub-header">About</h2>
                    <div className="setting-card">
                        <div className="setting-text">
                            <p>
                               Built by <a className="footer-link" href="https://stua.rtfoy.co.uk">Stuart Foy</a> with love for the DDR community. The stepchart parsing logic is based on the work of <a className="footer-link" href="https://github.com/city41/stepcharts">city41</a>. The stepcharts files are built by the community at <a className="footer-link" href="https://zenius-i-vanisher.com/">Zenius-I-Vanisher</a>, based on orignal work by Konami. Decimalized rankings from <a className="footer-link" href="https://3icecream.com/">Sanbai Ice Cream</a> and are based on the Version 10 Revision 1 release.<br></br><br></br>Crafted with an organic blend of Gemini 2.5 Pro via GeminiCLI and ChatGPT Codex (with a sprinkle of ChatGPT 4o for initial planning). Human intelligence used sparingly. <br></br><br></br> Always remember to wear deoderant when playing DDR, and clean up after you've used the bathroom. <br></br><br></br> This tool is not affiliated with Konami or any other company. It is a fan-made project for educational purposes only.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;