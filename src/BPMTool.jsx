import React, { useState, useMemo, useContext, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useFilters } from './contexts/FilterContext.jsx';
import { StepchartPage } from './components/StepchartPage.jsx';
import SongInfoBar from './components/SongInfoBar.jsx';
import FilterModal from './components/FilterModal.jsx';
import Camera from './Camera.jsx';
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

export const getBpmRange = (bpm) => {
    if (typeof bpm !== 'string') return { min: 0, max: 0 };
    const parts = bpm.split('-').map(Number);
    if (parts.length === 1) return { min: parts[0], max: parts[0] };
    return { min: Math.min(...parts), max: Math.max(...parts) };
};

const BPMTool = ({ smData, simfileData, currentChart, setCurrentChart, onSongSelect, selectedGame, setSelectedGame, view, setView }) => {
    const { targetBPM, multipliers, apiKey, playStyle, setPlayStyle } = useContext(SettingsContext);
    const { filters, resetFilters } = useFilters();
    const [songOptions, setSongOptions] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const savedState = localStorage.getItem('isCollapsed');
        return savedState ? JSON.parse(savedState) : false;
    });
    const [showAltBpm, setShowAltBpm] = useState(false);
    const [showAltCoreBpm, setShowAltCoreBpm] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [speedmod, setSpeedmod] = useState(1);
    const [showFilter, setShowFilter] = useState(false);
    const [songMeta, setSongMeta] = useState([]);
    const filtersActive = Boolean(
        filters.bpmMin !== '' ||
        filters.bpmMax !== '' ||
        filters.difficultyMin !== '' ||
        filters.difficultyMax !== '' ||
        filters.games.length > 0 ||
        filters.artist !== '' ||
        filters.multiBpm !== 'any'
    );

    useEffect(() => {
        localStorage.setItem('isCollapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    const isLoading = !simfileData;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        fetch('/song-meta.json')
            .then(res => res.json())
            .then(setSongMeta)
            .catch(err => console.error('Failed to load song meta:', err));
    }, []);

    useEffect(() => {
        if (!simfileData || !currentChart) return;

        const newMode = playStyle;
        const currentDifficulty = currentChart.difficulty;

        const chartsInNewMode = simfileData.availableTypes.filter(c => c.mode === newMode);

        if (chartsInNewMode.length === 0) return;

        let newChart = chartsInNewMode.find(c => c.difficulty === currentDifficulty);
        if (!newChart) {
            newChart = chartsInNewMode.find(c => c.difficulty === 'Difficult');
        }
        if (!newChart) {
            newChart = chartsInNewMode[0];
        }
        setCurrentChart(newChart);

    }, [playStyle, simfileData]);

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
                const bpmChanges = chartDetails.bpm;
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
        if (!smData.files.length) return;
        let filteredFiles = smData.files;
        if (selectedGame !== 'all') {
            filteredFiles = filteredFiles.filter(file => file.path.startsWith(`sm/${selectedGame}/`));
        }

        const metaMap = new Map(songMeta.map(m => [m.path, m]));

        filteredFiles = filteredFiles.filter(file => {
            const meta = metaMap.get(file.path);
            if (!meta) return false;
            if (filters.games.length && !filters.games.includes(meta.game)) return false;
            if (filters.artist && !meta.artist.toLowerCase().includes(filters.artist.toLowerCase())) return false;
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (filters.multiBpm === 'single' && !isSingleBpm) return false;
            if (filters.multiBpm === 'multiple' && isSingleBpm) return false;
            if (filters.bpmMin !== '' && meta.bpmMax < Number(filters.bpmMin)) return false;
            if (filters.bpmMax !== '' && meta.bpmMin > Number(filters.bpmMax)) return false;
            if (filters.difficultyMin !== '' || filters.difficultyMax !== '') {
                const maxFeet = Math.max(...meta.difficulties.map(d => d.feet));
                const minFeet = Math.min(...meta.difficulties.map(d => d.feet));
                if (filters.difficultyMin !== '' && maxFeet < Number(filters.difficultyMin)) return false;
                if (filters.difficultyMax !== '' && minFeet > Number(filters.difficultyMax)) return false;
            }
            return true;
        });

        const options = filteredFiles.map(file => ({
            value: file.path,
            label: file.title,
            title: file.title,
            titleTranslit: file.titleTranslit
        }));
        setSongOptions(options);
    }, [selectedGame, smData, songMeta, filters]);

    const selectStyles = {
        control: (styles) => ({ ...styles, backgroundColor: 'var(--card-bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-color)', padding: '0.3rem', borderRadius: '0.5rem' }),
        menu: (styles) => ({ ...styles, backgroundColor: 'var(--bg-color-light)', zIndex: 1000 }),
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
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
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
                onSongSelect(matchedSong);
            }
        } catch (error) {
            console.error("Error with Gemini API:", error);
            setInputValue("Error identifying song.");
        } finally {
            setIsProcessing(false);
        }
    }

    const handleToggle = (index) => {
        setView(index === 0 ? 'bpm' : 'chart');
    };

    return (
        <>
        <div className="app-container">
            <div className="selection-container">
                <div className="controls-container">
                    <div className="top-row">
                        <div className="play-mode-toggle">
                            <button onClick={() => setView(v => v === 'bpm' ? 'chart' : 'bpm')} className={view === 'bpm' ? 'active' : ''}>BPM</button>
                            <button onClick={() => setView(v => v === 'bpm' ? 'chart' : 'bpm')} className={view === 'chart' ? 'active' : ''}>Chart</button>
                        </div>
                        <select 
                            className="game-select" 
                            value={selectedGame} 
                            onChange={(e) => { setSelectedGame(e.target.value); onSongSelect(null); }}
                            disabled={filters.games.length > 0}
                        >
                            <option value="all">All Games</option>
                            {smData.games.map(game => (<option key={game} value={game}>{game}</option>))}
                        </select>
                    </div>
                    <div className="song-search-row">
                        <div className="song-select-container">
                            <Select
                                className="song-select"
                                options={songOptions}
                                value={simfileData ? { label: simfileData.title.titleName, value: simfileData.title.titleName } : null}
                                onChange={(selected) => onSongSelect(selected)}
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
                        <div className="action-buttons">
                            {apiKey && <Camera onCapture={sendToGemini} isProcessing={isProcessing} />}
                            <button className={`filter-button ${filtersActive ? 'active' : ''}`} onClick={() => setShowFilter(true)}>
                                <i className="fa-solid fa-filter"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`chart-section ${isCollapsed ? 'collapsed' : ''}`}>
                <SongInfoBar
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                    gameVersion={gameVersion}
                    songTitle={songTitle}
                    artist={artist}
                    playStyle={playStyle}
                    difficulties={difficulties}
                    currentChart={currentChart}
                    setCurrentChart={setCurrentChart}
                    simfileData={simfileData}
                    bpmDisplay={bpmDisplay}
                    calculation={calculation}
                    showAltBpm={showAltBpm}
                    setShowAltBpm={setShowAltBpm}
                    coreBpm={coreBpm}
                    coreCalculation={coreCalculation}
                    showAltCoreBpm={showAltCoreBpm}
                    setShowAltCoreBpm={setShowAltCoreBpm}
                    view={view}
                />
                {view === 'bpm' ? (
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
                ) : (
                    <StepchartPage
                        simfile={simfileData}
                        currentType={currentChart ? currentChart.slug : (simfileData?.availableTypes?.[0]?.slug)}
                        setCurrentChart={setCurrentChart}
                        isCollapsed={isCollapsed}
                        setIsCollapsed={setIsCollapsed}
                        playStyle={playStyle}
                        speedmod={speedmod}
                    />
                )}
                 {view === 'chart' && (
                    <div className="smod-controls-container">
                        <button className="smod-button" onClick={() => setSpeedmod(prev => Math.max(1, prev - 0.5))}>-</button>
                        <div className="smod-value">{speedmod}x</div>
                        <button className="smod-button" onClick={() => setSpeedmod(prev => Math.min(3, prev + 0.5))}>+</button>
                    </div>
                )}
            </div>
        </div>
        <FilterModal isOpen={showFilter} onClose={() => setShowFilter(false)} games={smData.games} />
        </>
    );
};

export default BPMTool;