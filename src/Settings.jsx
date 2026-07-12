import React, { useState, useContext, useEffect } from 'react';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useScores } from './contexts/ScoresContext.jsx';
import { MULTIPLIER_MODES } from './utils/multipliers';
import {
    getSonglistOverrideGameValue,
    getSonglistOverrideValueForGameVariant,
    getSonglistOverrideVariantOptions,
    getSonglistOverrideVariantValue,
    SONGLIST_OVERRIDE_GAME_OPTIONS,
} from './utils/songlistOverrides';
import { similarity, normalizeString } from './utils/stringSimilarity.js';
import { makeScoreKey } from './utils/scoreKey.js';
import ThemeSwitcher from './components/ThemeSwitcher';
import { Switch } from './components/Switch.jsx';
import { TwoOptionSwitch } from "./components/TwoOptionSwitch.jsx";
import ModalShell from "./components/ModalShell.jsx";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faUpload, faDownload } from '@fortawesome/free-solid-svg-icons';
import './Settings.css';
import { useAuth } from './contexts/AuthContext.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useOfflineCache } from './hooks/useOfflineCache.js';
import { SANBAI_RANKINGS_METADATA } from './utils/sanbaiRankingsMetadata.js';

const CHANGELOG_UPDATES = [
    {
        date: 'Jul 4, 2026',
        items: [
            'Expanded Song List Override support across DDR mainline releases, with regional variants where available and separate Game / Region selectors.',
            'Improved Song List Override matching for songs with multiple versions, so older filters prefer older chart entries and newer filters prefer newer entries.',
            'Added Card Draw tournament tools: editable round/player labels, eligible chart previews, CSV export, action-based ordering, and an option to hide vetoed cards.',
            'Added Chart page keyboard navigation for moving between songs with the left and right arrow keys.',
            'Added latest DDR WORLD chart updates.',
            'Updated to Sanbai Ice Cream Version 12 Rankings',
        ],
    },
    {
        date: 'Feb 15, 2026',
        items: [
            'Added a new "Turn on WIP stats" beta switch in Settings to reveal in-progress Stats views when enabled.',
            'Refined Chart page controls with a cleaner layout and a minimize/expand quick button.',
            'Improved mobile Chart controls with a full-width bottom panel for easier access.',
            'Improved light-mode readability across key BPM and Dan header surfaces.',
            'Updated Song Filter chips (Game Versions and Difficulty Names) for clearer, centered labels and better spacing.',
            'Removed list color editing from Lists page to simplify list management controls.',
        ],
    },
    {
        date: 'Feb 9, 2026',
        items: [
            'Improved page load speed.',
            'Improved advanced filters.',
        ],
    },
    {
        date: 'Feb 8, 2026',
        items: [
            'Light mode now works properly.',
            'Added Advanced Filters page with min/max chart-stat filters for Density, Footwork, Flow Patterns, Advanced Patterns, and Stops.',
            'Advanced chart-stat filters now apply in both BPM and Card Draw.',
            'Card Draw now respects advanced filter ranges in live counts and draw pool selection.',
            'BPM selection retention fixed when advanced filters are enabled and chart metadata is still loading.',
            'StepMania tech preprocessing now uses ITGmania-style StepParity extraction merged with extended heuristic metrics.',
        ],
    },
    {
        date: 'Feb 7, 2026',
        items: [
            'Preliminary DDR World EU Song List added.',
            'Offline mode added.',
        ],
    },
    {
        date: 'Feb 1, 2026',
        items: [
            'Ranked ratings filters now support min/max decimal ranges. (Request: Jynxatu)',
            'Filter modals show live song and chart counts.',
            'Song list overrides now include artist and difficulty data for safer matching. (Bug: JUWUBEAT/Vetch)',
            'Added latest WORLD charts',
            'Build process streamlined',
            `Updated to Sanbai Ice Cream ${SANBAI_RANKINGS_METADATA.label} Rankings`,
        ],
    },
];

const Settings = () => {
    const {
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
        showVegaBeta,
        setShowVegaBeta,
        showTransliterationBeta,
        setShowTransliterationBeta,
        showWipStats,
        setShowWipStats,
        songlistOverride,
        setSonglistOverride,
        showMultiplierIncrementVersion,
        setShowMultiplierIncrementVersion,
        worldDifficultyChanges,
        setWorldDifficultyChanges,
        worldRemoveChallengeCharts,
        setWorldRemoveChallengeCharts,
    } = useContext(SettingsContext);

    const { scores, setScores, loadSongMeta } = useScores();
    const { groups } = useGroups();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const {
        supported: offlineSupported,
        enabled: offlineEnabled,
        downloading: offlineDownloading,
        statusLabel: offlineStatusLabel,
        error: offlineError,
        startDownload,
        clearDownload,
    } = useOfflineCache();
    const offlineDownloadLabel = offlineDownloading ? 'Downloading...' : 'Download';
    const canDownloadOffline = Boolean(user);
    const offlineFeatureEnabled = import.meta.env.MODE !== 'no-pwa';
    const selectedOverrideGame = getSonglistOverrideGameValue(songlistOverride);
    const selectedOverrideVariant = getSonglistOverrideVariantValue(songlistOverride);
    const songlistOverrideVariants = getSonglistOverrideVariantOptions(selectedOverrideGame);
    const [showOlderUpdates, setShowOlderUpdates] = useState(false);

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
                    <div className="setting-card setting-card-songlist">
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
                    <div className="setting-card setting-card-toggle setting-card-playstyle">
                        <div className="setting-text">
                            <h3>Play Style</h3>
                            <p>
                                Choose Single (SP) or Double (DP) for charts, rankings and filters.
                            </p>
                        </div>
                        <div className="setting-control">
                            <TwoOptionSwitch
                                ariaLabel="Play style"
                                className="settings-playstyle-toggle"
                                options={[
                                  {
                                    value: "single",
                                    label: (
                                      <span className="settings-playstyle-label">
                                        <span className="settings-playstyle-long">Single</span>
                                        <span className="settings-playstyle-short">SP</span>
                                      </span>
                                    ),
                                  },
                                  {
                                    value: "double",
                                    label: (
                                      <span className="settings-playstyle-label">
                                        <span className="settings-playstyle-long">Double</span>
                                        <span className="settings-playstyle-short">DP</span>
                                      </span>
                                    ),
                                  },
                                ]}
                                value={playStyle || "single"}
                                onChange={setPlayStyle}
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
                        <div className="setting-control setting-control-stack">
                            <select
                                value={multiplierMode}
                                onChange={(e) => setMultiplierMode(e.target.value)}
                                className="settings-select"
                            >
                                {Object.values(MULTIPLIER_MODES).map(mode => (
                                    <option key={mode} value={mode}>{mode}</option>
                                ))}
                            </select>
                            <div className="settings-inline-toggle">
                                <span>Show selector on Multiplier page</span>
                                <Switch
                                    checked={showMultiplierIncrementVersion}
                                    onChange={(e) => setShowMultiplierIncrementVersion(e.target.checked)}
                                    ariaLabel="Toggle multiplier increment version selector"
                                />
                            </div>
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
                            <div className="songlist-override-controls">
                                <select
                                    value={selectedOverrideGame}
                                    onChange={(e) => setSonglistOverride(getSonglistOverrideValueForGameVariant(e.target.value, 'mainline'))}
                                    className="settings-select"
                                >
                                    {SONGLIST_OVERRIDE_GAME_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <select
                                    value={selectedOverrideVariant}
                                    onChange={(e) => setSonglistOverride(getSonglistOverrideValueForGameVariant(selectedOverrideGame, e.target.value))}
                                    className="settings-select"
                                    disabled={songlistOverrideVariants.length <= 1}
                                >
                                    {songlistOverrideVariants.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
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

                    {offlineFeatureEnabled && (
                        <div className="setting-card setting-card-toggle">
                            <div className="setting-text">
                                <h3>Offline Data</h3>
                                <p>
                                    Download song data and SM files for offline use.
                                </p>
                                <p className="settings-status">{offlineStatusLabel}</p>
                                {offlineError && (<p className="settings-status settings-status-error">{offlineError}</p>)}
                                {!canDownloadOffline && (
                                    <p className="settings-status">Log in to download offline data.</p>
                                )}
                            </div>
                            {canDownloadOffline && (
                                <div className="setting-control">
                                    <button
                                        onClick={startDownload}
                                        className="settings-button settings-button-icon"
                                        disabled={!offlineSupported || offlineDownloading}
                                        aria-label={offlineDownloadLabel}
                                        title={offlineDownloadLabel}
                                    >
                                        <FontAwesomeIcon icon={faDownload} />
                                    </button>
                                    <button
                                        onClick={clearDownload}
                                        className="settings-button settings-button-danger settings-button-icon"
                                        disabled={!offlineSupported || offlineDownloading || !offlineEnabled}
                                        aria-label="Clear offline data"
                                        title="Clear offline data"
                                    >
                                        <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Turn on WIP stats</h3>
                            <p>
                                Show in-progress stats views on the Stats page.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={showWipStats}
                                onChange={(e) => setShowWipStats(e.target.checked)}
                                ariaLabel="Toggle WIP stats"
                            />
                        </div>
                    </div>

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Show Courses</h3>
                            <p>
                                Show the courses page. May be slow and inaccurate. 
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

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Show Vega Rankings</h3>
                            <p>
                                Show the Vega Rankings page.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={showVegaBeta}
                                onChange={(e) => setShowVegaBeta(e.target.checked)}
                                ariaLabel="Toggle Vega Rankings beta"
                            />
                        </div>
                    </div>

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Show Transliteration</h3>
                            <p>
                                Display title and artist transliterations when available.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={showTransliterationBeta}
                                onChange={(e) => setShowTransliterationBeta(e.target.checked)}
                                ariaLabel="Toggle transliteration beta"
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

                    <div className="setting-card setting-card-toggle">
                        <div className="setting-text">
                            <h3>Remove WORLD Challenge Charts</h3>
                            <p>
                                Hide the Challenge charts added in DDR WORLD from the app.
                            </p>
                        </div>
                        <div className="setting-control">
                            <Switch
                                checked={worldRemoveChallengeCharts}
                                onChange={(e) => setWorldRemoveChallengeCharts(e.target.checked)}
                                ariaLabel="Toggle removing WORLD challenge charts"
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
                                    You have&nbsp;{Object.keys(scores.single).length}&nbsp;SP and&nbsp;
                                    {Object.keys(scores.double).length}&nbsp;DP scores.
                                </p>
                                <details className="upload-format-help">
                                    <summary className="upload-format-summary">JSON upload format</summary>
                                    <p className="upload-format-description">
                                        JSON uploads should be an object with a <code>scores</code> array. You can
                                        optionally provide <code>meta.playtype</code> as <code>SP</code> or <code>DP</code>;
                                        if omitted, the selector next to upload is used.
                                    </p>
                                    <ul className="upload-format-list">
                                        <li>
                                            Required per score: <code>identifier</code>, <code>artist</code>, <code>difficulty</code>, <code>score</code>, <code>lamp</code>
                                        </li>
                                        <li>
                                            Optional per score: <code>optional.flare</code>
                                        </li>
                                    </ul>
                                    <pre className="upload-format-example">{`{
  "meta": {
    "game": "ddr",
    "playtype": "SP",
    "service": "Custom"
  },
  "scores": [
    {
      "identifier": "MAX 300",
      "artist": "Ω",
      "difficulty": "Expert",
      "score": 987650,
      "lamp": "CLEAR",
      "optional": {
        "flare": "III"
      }
    }
  ]
}`}</pre>
                                </details>
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
                                <ModalShell.Button
                                    variant="danger"
                                    onClick={clearScores}
                                    disabled={processing}
                                    aria-label="Delete stats"
                                >
                                    <FontAwesomeIcon icon={faTrash} />
                                    <span className="settings-clear-label">Delete stats</span>
                                </ModalShell.Button>
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

                    <h2 className="settings-sub-header">Changelog</h2>
                    <div className="setting-card settings-changelog-card">
                        <div className="setting-text">
                            <h3>{CHANGELOG_UPDATES[0].date}</h3>
                            <ul className="settings-changelog">
                                {CHANGELOG_UPDATES[0].items.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                            {CHANGELOG_UPDATES.length > 1 && (
                                <button
                                    type="button"
                                    className="settings-changelog-toggle"
                                    onClick={() => setShowOlderUpdates((prev) => !prev)}
                                >
                                    {showOlderUpdates ? 'Hide older updates' : 'Show older updates'}
                                </button>
                            )}
                            {showOlderUpdates && CHANGELOG_UPDATES.slice(1).map((update) => (
                                <div key={update.date} className="settings-changelog-entry">
                                    <h3>{update.date}</h3>
                                    <ul className="settings-changelog">
                                        {update.items.map((item) => (
                                            <li key={`${update.date}-${item}`}>{item}</li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>

                    <h2 className="settings-sub-header">About</h2>
                    <div className="setting-card">
                        <div className="setting-text">
                            <p>
                               Built by <a className="footer-link" href="https://stua.rtfoy.co.uk">Stuart Foy</a> with love for the DDR community. The stepchart parsing logic is based on the work of <a className="footer-link" href="https://github.com/city41/stepcharts">city41</a>. The stepcharts files are built by the community at <a className="footer-link" href="https://zenius-i-vanisher.com/">Zenius-I-Vanisher</a>, based on orignal work by Konami. Decimalized rankings from <a className="footer-link" href="https://3icecream.com/">Sanbai Ice Cream</a> and are based on the {SANBAI_RANKINGS_METADATA.label} release. Card pick system inspired by <a className="footer-link" href="https://ddr.tools/">ddr.tools</a>. <br></br><br></br>
                               Crafted with an organic blend of Gemini 2.5 Pro via GeminiCLI and ChatGPT Codex (with a sprinkle of ChatGPT 4o for initial planning). Human intelligence used sparingly. <br></br><br></br>
                               Tech counting includes a derived JavaScript port of ITGmania/StepMania StepParity/TechCounts logic, licensed under GPL-3.0-or-later. See LICENSE and THIRD_PARTY_NOTICES.md for details. <br></br><br></br>
                               Follow the development, suggest features and report bugs at the at the <a className="footer-link" href="https://discord.gg/5gy4zwbPRC">UK DDR Discord</a> or <a className="footer-link" href="https://github.com/blackalice/ddr-dan-tool">Github</a> <br></br><br></br>
                               Always remember to wear deoderant when playing DDR, and clean up after you've used the bathroom. <br></br><br></br>
                               This tool is not affiliated with Konami or any other company. It is a fan-made project for educational purposes only.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
