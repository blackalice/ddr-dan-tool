import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useLocation, useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { DifficultyMeter, difficultyLevels, difficultyNameMapping } from './components/DifficultyMeter';
import Camera from './Camera';
import './BPMTool.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const getLastBeat = (notes) => {
    if (!notes) return 0;
    const measuresList = notes.split(',');
    let lastNoteMeasureIndex = -1;
    for (let j = measuresList.length - 1; j >= 0; j--) {
        if (/[1234MKLF]/i.test(measuresList[j])) {
            lastNoteMeasureIndex = j;
            break;
        }
    }
    if (lastNoteMeasureIndex !== -1) {
        const lastMeasureStr = measuresList[lastNoteMeasureIndex];
        const lines = lastMeasureStr.trim().split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return 0;
        let lastNoteLineIndex = -1;
        for (let k = lines.length - 1; k >= 0; k--) {
            if (/[1234MKLF]/i.test(lines[k])) {
                lastNoteLineIndex = k;
                break;
            }
        }
        if (lastNoteLineIndex !== -1) {
            const beatsInMeasure = 4;
            return (lastNoteMeasureIndex * beatsInMeasure) + (lastNoteLineIndex / lines.length) * beatsInMeasure;
        }
    }
    return 0;
};

const calculateChartData = (bpmChanges, songLastBeat) => {
    if (!bpmChanges || bpmChanges.length === 0) return [];
    const dataPoints = [];
    let currentTime = 0;
    let lastBeat = 0;
    let currentBpm = bpmChanges[0].bpm;
    dataPoints.push({ x: 0, y: currentBpm });
    lastBeat = bpmChanges[0].startOffset * 4; // Convert offset to beats
    for (let i = 1; i < bpmChanges.length; i++) {
        const change = bpmChanges[i];
        const beatsElapsed = (change.startOffset * 4) - lastBeat;
        if (currentBpm > 0) {
            currentTime += (beatsElapsed / currentBpm) * 60;
        }
        dataPoints.push({ x: currentTime, y: currentBpm });
        currentBpm = change.bpm;
        dataPoints.push({ x: currentTime, y: currentBpm });
        lastBeat = change.startOffset * 4;
    }
    const beatsRemaining = songLastBeat - lastBeat;
    if (currentBpm > 0 && beatsRemaining > 0) {
        currentTime += (beatsRemaining / currentBpm) * 60;
    }
    dataPoints.push({ x: currentTime, y: currentBpm });
    return dataPoints;
};

const calculateCoreBpm = (bpmChanges, songLastBeat) => {
    if (!bpmChanges || bpmChanges.length === 0) return null;
    if (bpmChanges.length === 1) return bpmChanges[0].bpm;
    const bpmDurations = new Map();
    let lastBeat = 0;
    let currentBpm = bpmChanges[0].bpm;
    for (let i = 1; i < bpmChanges.length; i++) {
        const change = bpmChanges[i];
        const beatsElapsed = (change.startOffset * 4) - lastBeat;
        if (currentBpm > 0) {
            const duration = (beatsElapsed / currentBpm) * 60;
            bpmDurations.set(currentBpm, (bpmDurations.get(currentBpm) || 0) + duration);
        }
        currentBpm = change.bpm;
        lastBeat = change.startOffset * 4;
    }
    const beatsRemaining = songLastBeat - lastBeat;
    if (currentBpm > 0 && beatsRemaining > 0) {
        const finalSegmentDuration = (beatsRemaining / currentBpm) * 60;
        bpmDurations.set(currentBpm, (bpmDurations.get(currentBpm) || 0) + finalSegmentDuration);
    }
    if (bpmDurations.size === 0) return null;
    let maxDuration = 0;
    let coreBpm = null;
    for (const [bpm, duration] of bpmDurations.entries()) {
        if (duration > maxDuration) {
            maxDuration = duration;
            coreBpm = bpm;
        }
    }
    return coreBpm;
};

const MenuList = ({ options, children, maxHeight, getValue }) => {
    const [value] = getValue();
    const initialOffset = options.indexOf(value) * 35;
    return (
        <List height={maxHeight} itemCount={children.length} itemSize={35} initialScrollOffset={initialOffset}>
            {({ index, style }) => <div style={style}>{children[index]}</div>}
        </List>
    );
};

const getBpmRange = (bpm) => {
    if (typeof bpm !== 'string') return { min: 0, max: 0 };
    const parts = bpm.split('-').map(Number);
    if (parts.length === 1) return { min: parts[0], max: parts[0] };
    return { min: Math.min(...parts), max: Math.max(...parts) };
};

const BPMTool = ({ selectedGame, setSelectedGame, selectedSong, setSelectedSong, smData, simfileData, currentChart, setCurrentChart }) => {
    const { targetBPM, multipliers, apiKey } = useContext(SettingsContext);
    const navigate = useNavigate();
    const [songOptions, setSongOptions] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showAltBpm, setShowAltBpm] = useState(false);
    const [showAltCoreBpm, setShowAltCoreBpm] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    const isLoading = !simfileData;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleSongSelection = (song) => {
        setSelectedSong(song);
        if (song) {
            navigate(`/bpm?song=${encodeURIComponent(song.title)}`);
        } else {
            navigate('/bpm');
        }
    };

    const { songTitle, artist, gameVersion, difficulties, bpmDisplay, coreBpm, chartData } = useMemo(() => {
        if (!simfileData) {
            return {
                songTitle: 'Please select a song',
                artist: '...',
                gameVersion: '',
                difficulties: { singles: {}, doubles: {} },
                bpmDisplay: 'N/A',
                coreBpm: null,
                chartData: null,
            };
        }

        const diffs = { singles: {}, doubles: {} };
        simfileData.availableTypes.forEach(chart => {
            if (chart.mode === 'single') {
                diffs.singles[chart.difficulty] = chart.feet;
            } else if (chart.mode === 'double') {
                diffs.doubles[chart.difficulty] = chart.feet;
            }
        });

        let display = 'N/A';
        let core = null;
        let data = null;

        if (currentChart && simfileData.charts) {
            const chartDetails = simfileData.charts[currentChart.slug];
            if (chartDetails) {
                const bpmChanges = chartDetails.bpm; // Use the pre-parsed BPM data
                const lastBeat = getLastBeat(chartDetails.notes);
                
                if (bpmChanges && bpmChanges.length > 0) {
                    const bpms = bpmChanges.map(b => b.bpm).filter(bpm => bpm > 0);
                    if (bpms.length === 1) {
                        display = String(Math.round(bpms[0]));
                    } else if (bpms.length > 1) {
                        const minBpm = Math.round(Math.min(...bpms));
                        const maxBpm = Math.round(Math.max(...bpms));
                        display = minBpm === maxBpm ? String(minBpm) : `${minBpm}-${maxBpm}`;
                    }
                }
                
                core = calculateCoreBpm(bpmChanges, lastBeat);
                data = calculateChartData(bpmChanges, lastBeat);
            }
        }

        return {
            songTitle: simfileData.title.titleName,
            artist: simfileData.artist,
            gameVersion: simfileData.mix.mixName,
            difficulties: diffs,
            bpmDisplay: display,
            coreBpm: core,
            chartData: data,
        };
    }, [simfileData, currentChart]);

    const calculation = useMemo(() => {
        if (!targetBPM || !bpmDisplay || bpmDisplay === 'N/A') return null;
        const numericTarget = Number(targetBPM) || 0;
        const bpmRange = getBpmRange(bpmDisplay);
        if (bpmRange.max === 0) return null;
        const idealMultiplier = numericTarget / bpmRange.max;
        const closestMultiplier = multipliers.reduce((prev, curr) => Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev);
        const closestIndex = multipliers.indexOf(closestMultiplier);
        const primarySpeed = (bpmRange.max * closestMultiplier);
        let alternativeMultiplier = null;
        if (primarySpeed > numericTarget) {
            if (closestIndex > 0) alternativeMultiplier = multipliers[closestIndex - 1];
        } else {
            if (closestIndex < multipliers.length - 1) alternativeMultiplier = multipliers[closestIndex + 1];
        }
        const result = {
            primary: { modifier: closestMultiplier, minSpeed: Math.round(bpmRange.min * closestMultiplier), maxSpeed: Math.round(primarySpeed), isRange: bpmRange.min !== bpmRange.max },
            alternative: null
        };
        if (alternativeMultiplier) {
            const altMaxSpeed = (bpmRange.max * alternativeMultiplier);
            result.alternative = { modifier: alternativeMultiplier, minSpeed: Math.round(bpmRange.min * alternativeMultiplier), maxSpeed: Math.round(altMaxSpeed), isRange: bpmRange.min !== bpmRange.max, direction: altMaxSpeed > primarySpeed ? 'up' : 'down' };
        }
        if (result.alternative && result.primary.maxSpeed === result.alternative.maxSpeed) {
            result.alternative = null;
        }
        return result;
    }, [targetBPM, bpmDisplay, multipliers]);

    const coreCalculation = useMemo(() => {
        if (!targetBPM || !coreBpm) return null;
        const numericTarget = Number(targetBPM) || 0;
        const idealMultiplier = numericTarget / coreBpm;
        const closestMultiplier = multipliers.reduce((prev, curr) => Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev);
        const closestIndex = multipliers.indexOf(closestMultiplier);
        const primarySpeed = (coreBpm * closestMultiplier);
        let alternativeMultiplier = null;
        if (primarySpeed > numericTarget) {
            if (closestIndex > 0) alternativeMultiplier = multipliers[closestIndex - 1];
        } else {
            if (closestIndex < multipliers.length - 1) alternativeMultiplier = multipliers[closestIndex + 1];
        }
        const result = {
            primary: { modifier: closestMultiplier, speed: Math.round(primarySpeed) },
            alternative: null
        };
        if (alternativeMultiplier) {
            const altSpeed = (coreBpm * alternativeMultiplier);
            result.alternative = { modifier: alternativeMultiplier, speed: Math.round(altSpeed), direction: altSpeed > primarySpeed ? 'up' : 'down' };
        }
        if (result.alternative && result.primary.speed === result.alternative.speed) {
            result.alternative = null;
        }
        return result;
    }, [targetBPM, coreBpm, multipliers]);

    const renderDifficulties = (playStyle) => {
        const difficultySet = playStyle === 'sp' ? difficulties.singles : difficulties.doubles;
        const chartDifficulties = simfileData ? simfileData.availableTypes.filter(t => t.mode === (playStyle === 'sp' ? 'single' : 'double')) : [];
        return difficultyLevels.map(levelName => {
            let level = null;
            let difficulty = null;
            let chartType = null;
            for (const name of difficultyNameMapping[levelName]) {
                if (difficultySet[name]) {
                    level = difficultySet[name];
                    difficulty = name;
                    if (simfileData) {
                        chartType = chartDifficulties.find(t => t.difficulty === name);
                    }
                    break;
                }
            }
            const isSelected = currentChart && currentChart.difficulty === difficulty && currentChart.mode === (playStyle === 'sp' ? 'single' : 'double');
            return (
                <DifficultyMeter
                    key={`${playStyle}-${levelName}`}
                    level={level || 'X'}
                    difficultyName={levelName}
                    isMissing={!level}
                    onClick={() => chartType && setCurrentChart(chartType)}
                    isSelected={isSelected}
                />
            );
        });
    };

    useEffect(() => {
        let filteredFiles = smData.files;
        if (selectedGame !== 'all') {
            filteredFiles = smData.files.filter(file => file.path.startsWith(`sm/${selectedGame}/`));
        }
        const options = filteredFiles.map(file => ({
            value: file.path,
            label: file.title,
            title: file.title,
            titleTranslit: file.titleTranslit
        }));
        setSongOptions(options);
    }, [selectedGame, smData]);

    const selectStyles = {
        control: (styles) => ({ ...styles, backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-color)', padding: '0.3rem', borderRadius: '0.5rem' }),
        menu: (styles) => ({ ...styles, backgroundColor: 'var(--bg-color-light)' }),
        option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            backgroundColor: isSelected ? 'var(--card-hover-bg-color)' : isFocused ? 'var(--card-bg-color)' : null,
            color: 'var(--text-color)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }),
        singleValue: (styles) => ({ ...styles, color: 'var(--text-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
        input: (styles) => ({ ...styles, color: 'var(--text-color)' }),
    };

    async function sendToGemini(imageDataUrl) {
        setIsProcessing(true);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-06-17" });
        const prompt = "From the attached image of a rhythm game screen, identify the song title. Return only the song title and nothing else. If the title is not visible, return 'Unknown'.";
        const image = { inlineData: { data: imageDataUrl.split(',')[1], mimeType: "image/jpeg" } };
        try {
            const result = await model.generateContent([prompt, image]);
            const response = await result.response;
            const text = response.text();
            setInputValue(text);
            const allSongOptions = smData.files.map(file => ({ value: file.path, label: file.title, title: file.title, titleTranslit: file.titleTranslit }));
            const matchedSong = allSongOptions.find(option => option.title.toLowerCase() === text.toLowerCase() || (option.titleTranslit && option.titleTranslit.toLowerCase() === text.toLowerCase()));
            if (matchedSong) {
                setSelectedGame('all');
                setSelectedSong(matchedSong);
            }
        } catch (error) {
            console.error("Error with Gemini API:", error);
            setInputValue("Error identifying song.");
        } finally {
            setIsProcessing(false);
        }
    }

    return (
        <div className="app-container">
            <div className="selection-container">
                <div className="controls-container">
                    <select className="game-select" value={selectedGame} onChange={(e) => { setSelectedGame(e.target.value); setSelectedSong(null); }}>
                        <option value="all">All Games</option>
                        {smData.games.map(game => (<option key={game} value={game}>{game}</option>))}
                    </select>
                    <div className="song-search-row">
                        <div className="song-select-container">
                            <Select
                                className="song-select"
                                options={songOptions}
                                value={selectedSong}
                                onChange={handleSongSelection}
                                styles={selectStyles}
                                placeholder="Search for a song..."
                                isClearable
                                components={{ MenuList }}
                                inputValue={inputValue}
                                onInputChange={setInputValue}
                                filterOption={(option, rawInput) => {
                                    const { label, data } = option;
                                    const { title, titleTranslit } = data;
                                    const input = rawInput.toLowerCase();
                                    return label.toLowerCase().includes(input) || (titleTranslit && titleTranslit.toLowerCase().includes(input));
                                }}
                            />
                        </div>
                        {apiKey && <Camera onCapture={sendToGemini} isProcessing={isProcessing} />}
                    </div>
                </div>
            </div>

            <div className={`chart-section ${isCollapsed ? 'collapsed' : ''}`}>
                <div className="song-info-bar">
                    <div className="song-title-container">
                        <h2 className="song-title bpm-title-mobile">
                            <div className="title-content-wrapper">
                                {gameVersion && <span className="song-game-version">{gameVersion}</span>}
                                <div className="title-artist-group">
                                    <span className="song-title-main">{songTitle}</span>
                                    <span className="song-title-separator"> - </span>
                                    <span className="song-title-artist">{artist}</span>
                                </div>
                            </div>
                            <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
                                <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
                            </button>
                        </h2>
                    </div>
                    {!isCollapsed && (
                        <div className="details-grid bpm-tool-grid">
                            <div className="grid-item grid-item-sp">
                                <span className="play-style">SP</span>
                                <div className="difficulty-meters-container">
                                    {renderDifficulties('sp')}
                                </div>
                            </div>
                            <div className="grid-item grid-item-bpm">
                                <span className="bpm-label">BPM:</span>
                                <div className="bpm-value-container">
                                    <span className="bpm-value">{bpmDisplay}</span>
                                    {calculation && (
                                        <div className="song-calculation">
                                            <span className="song-speed">
                                                {(showAltBpm && calculation.alternative) ? (calculation.alternative.isRange ? `${calculation.alternative.minSpeed}-${calculation.alternative.maxSpeed}` : calculation.alternative.maxSpeed) : (calculation.primary.isRange ? `${calculation.primary.minSpeed}-${calculation.primary.maxSpeed}` : calculation.primary.maxSpeed)}
                                            </span>
                                            <span className="song-separator">@</span>
                                            <span className="song-modifier">{(showAltBpm && calculation.alternative) ? calculation.alternative.modifier : calculation.primary.modifier}x</span>
                                        </div>
                                    )}
                                    {calculation && calculation.alternative && (
                                        <button className={`toggle-button ${showAltBpm && calculation.alternative ? (calculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`} onClick={() => setShowAltBpm(!showAltBpm)}>
                                            <i className={`fa-solid ${calculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid-item grid-item-dp">
                                <span className="play-style">DP</span>
                                <div className="difficulty-meters-container">
                                    {renderDifficulties('dp')}
                                </div>
                            </div>
                            <div className="grid-item grid-item-core">
                                <span className="core-bpm-label">CORE:</span>
                                <div className="core-bpm-value-container">
                                    <span className="core-bpm-value">{coreBpm ? coreBpm.toFixed(0) : 'N/A'}</span>
                                    {coreCalculation && (
                                        <div className="song-calculation">
                                            <span className="song-speed">
                                                {(showAltCoreBpm && coreCalculation.alternative) ? coreCalculation.alternative.speed : coreCalculation.primary.speed}
                                            </span>
                                            <span className="song-separator">@</span>
                                            <span className="song-modifier">{(showAltCoreBpm && coreCalculation.alternative) ? coreCalculation.alternative.modifier : coreCalculation.primary.modifier}x</span>
                                        </div>
                                    )}
                                    {coreCalculation && coreCalculation.alternative && (
                                        <button className={`toggle-button ${showAltCoreBpm && coreCalculation.alternative ? (coreCalculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`} onClick={() => setShowAltCoreBpm(!showAltCoreBpm)}>
                                            <i className={`fa-solid ${coreCalculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="chart-container">
                    {chartData ? (
                        <Line
                            data={{
                                datasets: [{
                                    label: 'BPM',
                                    data: chartData,
                                    borderColor: 'rgba(59, 130, 246, 1)',
                                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                    stepped: true,
                                    fill: true,
                                    pointRadius: 4,
                                    pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                                    pointBorderColor: '#fff',
                                    pointHoverRadius: 7,
                                    borderWidth: 2.5
                                }]
                            }}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    x: { type: 'linear', title: { display: false }, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, min: 0, max: chartData.length > 0 ? chartData[chartData.length - 1].x : 0 },
                                    y: { title: { display: false }, ticks: { color: '#9CA3AF', stepSize: 10 }, grid: { color: 'rgba(255, 255, 255,.1)' }, min: 0 }
                                },
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        enabled: !isMobile,
                                        mode: 'index',
                                        intersect: false,
                                        callbacks: {
                                            title: (tooltipItems) => `Time: ${tooltipItems[0].parsed.x.toFixed(2)}s`,
                                            label: (context) => `BPM: ${context.parsed.y}`
                                        }
                                    }
                                },
                                interaction: { mode: 'nearest', axis: 'x', intersect: false }
                            }}
                        />
                    ) : (
                        <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: '#9CA3AF', textAlign: 'center', padding: '1rem' }}>
                            <p>{isLoading ? 'Loading chart...' : 'The BPM chart for the selected song will be displayed here.'}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BPMTool;