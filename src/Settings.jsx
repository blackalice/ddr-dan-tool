import React, { useState, useContext, useEffect } from 'react';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { MULTIPLIER_MODES } from './utils/multipliers';
import { SONGLIST_OVERRIDE_OPTIONS } from './utils/songlistOverrides';
import { similarity, normalizeString } from './utils/stringSimilarity.js';
import { makeScoreKey } from './utils/scoreKey.js';
import ThemeSwitcher from './components/ThemeSwitcher';
import { Switch } from './components/Switch.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import './Settings.css';
import { useAuth } from './contexts/AuthContext.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { useNavigate } from 'react-router-dom';

const Settings = () => {
    const {
        apiKey,
        setApiKey,
        targetBPM,
        setTargetBPM,
        playStyle,
        setPlayStyle,
        multiplierMode,
        setMultiplierMode,
        // showLists is always enabled now
        showRankedRatings,
        setShowRankedRatings,
        showCoursesBeta,
        setShowCoursesBeta,
        songlistOverride,
        setSonglistOverride,
        worldDifficultyChanges,
        setWorldDifficultyChanges,
    } = useContext(SettingsContext);

    const { scores, setScores, loadSongMeta } = useScores();
    const { groups } = useGroups();
    const { user, logout } = useAuth();
    const [logoutAllBusy, setLogoutAllBusy] = useState(false);
    const onLogoutAll = async () => {
        if (logoutAllBusy) return;
        setLogoutAllBusy(true);
        try {
            await fetch('/api/logout-all', { method: 'POST', credentials: 'include' });
        } catch { /* noop */ }
        setLogoutAllBusy(false);
        await logout();
    };
    const navigate = useNavigate();

    const [songMeta, setSongMeta] = useState([]);
    const [songLookupStrict, setSongLookupStrict] = useState({});
    const [titleIndex, setTitleIndex] = useState(new Map());
    useEffect(() => {
        let cancelled = false;
        loadSongMeta()
            .then((data) => {
                if (cancelled) return;
                setSongMeta(data);
                const strictMap = {};
                const titleIdx = new Map(); // normalized title -> array of songs
                for (const song of data) {
                    if (song.title) {
                        const nt = normalizeString(song.title);
                        const arr = titleIdx.get(nt) || [];
                        arr.push(song);
                        titleIdx.set(nt, arr);
                    }
                    if (song.titleTranslit) {
                        const nt = normalizeString(song.titleTranslit);
                        const arr = titleIdx.get(nt) || [];
                        arr.push(song);
                        titleIdx.set(nt, arr);
                    }
                    if (song.title && song.artist) {
                        const k = `${normalizeString(song.title)}::${normalizeString(song.artist)}`;
                        strictMap[k] = song;
                    }
                    if (song.titleTranslit && song.artist) {
                        const k2 = `${normalizeString(song.titleTranslit)}::${normalizeString(song.artist)}`;
                        strictMap[k2] = song;
                    }
                }
                setSongLookupStrict(strictMap);
                setTitleIndex(titleIdx);
            })
            .catch(() => { /* noop */ });
        return () => {
            cancelled = true;
        };
    }, [loadSongMeta]);

    const [uploadPlaytype, setUploadPlaytype] = useState('SP');
    const [processing, setProcessing] = useState(false);
    const [uploadMessage, setUploadMessage] = useState('');
    const [unmatchedLines, setUnmatchedLines] = useState([]);

    const importParsedScores = (data) => {
        if (!Array.isArray(data.scores)) return { total: 0, unmatched: 0, unmatchedEntries: [] };
        const play = (data.meta && data.meta.playtype)
            ? data.meta.playtype.toUpperCase()
            : uploadPlaytype;
        const keyName = play === 'DP' ? 'double' : 'single';
        const newScores = {
            ...scores,
            [keyName]: { ...(scores[keyName] || {}) },
        };
        let unmatched = 0;
        const unmatchedEntries = [];
        for (const entry of data.scores) {
            const idNorm = normalizeString(entry.identifier || '');
            const artistNorm = normalizeString(entry.artist || '');
            let best = null;
            // Strict: title + artist exact normalized match
            if (idNorm && artistNorm) {
                const strictKey = `${idNorm}::${artistNorm}`;
                best = songLookupStrict[strictKey] || null;
            }
            let bestScore = -1;
            if (!best) {
                // Try loose matching across all songs using combined similarity of title and artist
                for (const song of songMeta) {
                    const titleSim = Math.max(
                        similarity(entry.identifier || '', song.title || ''),
                        similarity(entry.identifier || '', song.titleTranslit || '')
                    );
                    const artistSim = similarity(entry.artist || '', song.artist || '');
                    // Heavier weight on title, but artist matters
                    const combined = 0.7 * titleSim + 0.3 * artistSim;
                    if (combined > bestScore) { bestScore = combined; best = song; }
                }
                // Base threshold for acceptance
                const titleSimBest = best ? Math.max(
                    similarity(entry.identifier || '', best.title || ''),
                    similarity(entry.identifier || '', best.titleTranslit || '')
                ) : 0;
                const artistSimBest = best ? similarity(entry.artist || '', best.artist || '') : 0;

                // If multiple songs share the exact normalized title, require a stronger artist match
                const sameTitleCount = titleIndex.get(idNorm)?.length || 0;
                const requireArtistStrong = sameTitleCount > 1;

                const pass = (
                    // Very strong title match always OK
                    (titleSimBest >= 0.92) ||
                    // Good title + decent artist
                    (titleSimBest >= 0.82 && artistSimBest >= 0.5) ||
                    // If duplicate titles exist, require stronger artist
                    (requireArtistStrong && titleSimBest >= 0.80 && artistSimBest >= 0.65)
                );
                if (!pass) best = null;
            }
            if (best) {
                // Prefer stable chartId keys when we can derive them
                const key = makeScoreKey({
                    songId: best.id,
                    mode: keyName,
                    difficulty: entry.difficulty,
                    title: best.title,
                    artist: best.artist,
                });
                newScores[keyName][key] = { score: entry.score, lamp: entry.lamp };
                if (entry.optional && entry.optional.flare) {
                    newScores[keyName][key].flare = entry.optional.flare;
                }
            } else {
                unmatched++;
                unmatchedEntries.push(`${entry.identifier} - ${entry.difficulty}`);
            }
        }
        setScores(newScores);
        console.warn(`Imported ${data.scores.length - unmatched}/${data.scores.length} ${play} scores. ${unmatched} unmatched.`);
        return { total: data.scores.length, unmatched, unmatchedEntries };
    };


    const handleUploadFile = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        setProcessing(true);
        try {
            if (file.size > 5 * 1024 * 1024) {
                throw new Error('File too large');
            }
            const text = await file.text();
            const lowerName = file.name.toLowerCase();
            let result;
            const isJson = file.type === 'application/json' || lowerName.endsWith('.json') || text.trim().startsWith('{');
            const isHtml = file.type === 'text/html' || lowerName.endsWith('.html') || text.trim().startsWith('<');
            if (isJson) {
                let data;
                try {
                    data = JSON.parse(text);
                } catch {
                    throw new Error('Invalid JSON');
                }
                result = importParsedScores(data);
            } else if (isHtml) {
                const res = await fetch(`/api/parse-scores?playtype=${uploadPlaytype}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/html' },
                    body: text,
                });
                if (!res.ok) throw new Error('Server parse failed');
                const data = await res.json();
                result = importParsedScores(data);
            } else {
                throw new Error('Unsupported file type');
            }
            if (result) {
                setUploadMessage(`Imported ${result.total - result.unmatched} of ${result.total} scores.`);
                setUnmatchedLines((result.unmatchedEntries || []).slice(0, 100));
            }
        } catch (err) {
            console.error('Failed to import scores:', err);
            setUploadMessage('Failed to import scores');
        } finally {
            setProcessing(false);
            e.target.value = '';
        }
    };

    const clearScores = () => {
        if (window.confirm('Delete all stored scores?')) {
            setScores({ single: {}, double: {} });
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
                    {user ? (
                        <div className="setting-card setting-card-split">
                            <div className="setting-text">
                                <h3>Account</h3>
                                <p>
                                    Signed in as {user.email || 'unknown'} · {groups.length} lists · {Object.keys(scores.single).length + Object.keys(scores.double).length} scores.
                                </p>
                            </div>
                            <div className="setting-control">
                                <button onClick={logout} className="settings-button">Logout</button>
                            </div>
                        </div>
                    ) : (
                        <div className="setting-card setting-card-split">
                            <div className="setting-text">
                                <h3>Login</h3>
                                <p>
                                    Create an account to sync your scores, settings and lists across devices.
                                </p>
                            </div>
                            <div className="setting-control">
                                <button onClick={() => navigate('/login')} className="settings-button">Login</button>
                            </div>
                        </div>
                    )}
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
                            <h3>Play Style</h3>
                            <p>
                                Choose Single (SP) or Double (DP) for charts, rankings and filters.
                            </p>
                        </div>
                        <div className="setting-control">
                            <select
                                value={playStyle === 'double' ? 'DP' : 'SP'}
                                onChange={(e) => setPlayStyle(e.target.value === 'DP' ? 'double' : 'single')}
                                className="settings-select"
                            >
                                <option value="SP">Single (SP)</option>
                                <option value="DP">Double (DP)</option>
                            </select>
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

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Show Ranked Ratings</h3>
                            <p>
                                Display decimal ranked ratings instead of the standard foot level.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={showRankedRatings}
                                onChange={(e) => setShowRankedRatings(e.target.checked)}
                                ariaLabel="Toggle ranked ratings"
                            />
                        </div>
                    </div>

                    <h2 className="settings-sub-header">Beta Features</h2>

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Show Courses</h3>
                            <p>
                                Enable the experimental DDR Courses page and tab. Off by default.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={showCoursesBeta}
                                onChange={(e) => setShowCoursesBeta(e.target.checked)}
                                ariaLabel="Toggle courses beta"
                            />
                        </div>
                    </div>

                    {/* Custom List Function is always enabled; toggle removed */}

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>WORLD Difficulty Changes</h3>
                            <p>
                                Apply DDR WORLD difficulty updates when filtering and viewing charts.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={worldDifficultyChanges}
                                onChange={(e) => setWorldDifficultyChanges(e.target.checked)}
                                ariaLabel="Toggle WORLD difficulty changes"
                            />
                        </div>
                    </div>

                    {user ? (
                        <div className="setting-card">
                            <div className="setting-text">
                                <h3>Upload Scores</h3>
                                <p>
                                    Import your DDR scores in JSON or HTML format. Right click and save the
                                    HTML of your <code>ganymede-cg.net</code> scores page, then upload it here.
                                    Your browser currently stores {Object.keys(scores.single).length} SP and
                                    {Object.keys(scores.double).length} DP scores.
                                </p>
                            </div>
                            <div className="setting-control upload-control">
                                <input
                                    id="file-upload"
                                    type="file"
                                    accept=".json,application/json,text/html"
                                    onChange={handleUploadFile}
                                    className="hidden-file-input"
                                    disabled={processing}
                                />
                                <label htmlFor="file-upload" className="custom-file-upload settings-button" disabled={processing}>
                                    <FontAwesomeIcon icon={faUpload} /> Choose File
                                </label>
                                <select value={uploadPlaytype} onChange={(e) => setUploadPlaytype(e.target.value)} className="settings-select" disabled={processing}>
                                    <option value="SP">SP</option>
                                    <option value="DP">DP</option>
                                </select>
                                <button onClick={clearScores} className="settings-button" disabled={processing}>Delete Stats</button>
                            </div>
                            {processing && (<div className="upload-status">Processing...</div>)}
                            {!processing && uploadMessage && (<div className="upload-status">{uploadMessage}</div>)}
                            {!processing && unmatchedLines.length > 0 && (
                                <pre className="upload-console">
                                    {unmatchedLines.join('\n')}
                                </pre>
                            )}
                        </div>
                    ) : (
                        <div className="setting-card">
                            <div className="setting-text">
                                <h3>Upload Scores</h3>
                                <p>Log in to upload your scores from this device.</p>
                            </div>
                        </div>
                    )}

                    <h2 className="settings-sub-header">About</h2>
                    <div className="setting-card">
                        <div className="setting-text">
                            <p>
                               Built by <a className="footer-link" href="https://stua.rtfoy.co.uk">Stuart Foy</a> with love for the DDR community. The stepchart parsing logic is based on the work of <a className="footer-link" href="https://github.com/city41/stepcharts">city41</a>. The stepcharts files are built by the community at <a className="footer-link" href="https://zenius-i-vanisher.com/">Zenius-I-Vanisher</a>, based on orignal work by Konami. Decimalized rankings from <a className="footer-link" href="https://3icecream.com/">Sanbai Ice Cream</a> and are based on the Version 10 Revision 1 release. Card pick system inspired by <a className="footer-link" href="https://ddr.tools/">ddr.tools</a>. <br></br><br></br>Crafted with an organic blend of Gemini 2.5 Pro via GeminiCLI and ChatGPT Codex (with a sprinkle of ChatGPT 4o for initial planning). Human intelligence used sparingly. <br></br><br></br> Always remember to wear deoderant when playing DDR, and clean up after you've used the bathroom. <br></br><br></br> This tool is not affiliated with Konami or any other company. It is a fan-made project for educational purposes only.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
