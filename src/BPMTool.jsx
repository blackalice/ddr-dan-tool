import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';
import './BPMTool.css';

const gameFolders = {
    "A3": "sm/A3/",
    "A20Plus": "sm/A20Plus/"
};

const difficultyMap = {
    'Beginner': { color: '#4DB6AC' },
    'Basic': { color: '#FDD835' },
    'Difficult': { color: '#F44336' },
    'Expert': { color: '#8BC34A' },
    'Challenge': { color: '#BA68C8' },
};

const difficultyLevels = ['Beginner', 'Basic', 'Difficult', 'Expert', 'Challenge'];

const difficultyNameMapping = {
    'Beginner': ['Beginner'],
    'Basic': ['Basic', 'Easy', 'Light'],
    'Difficult': ['Difficult', 'Medium', 'Standard'],
    'Expert': ['Expert', 'Hard', 'Heavy'],
    'Challenge': ['Challenge', 'Oni']
};

const DifficultyMeter = ({ level, difficultyName, isMissing }) => {
    const style = {
        backgroundColor: isMissing ? '#374151' : difficultyMap[difficultyName]?.color || '#9E9E9E',
        color: (difficultyName === 'Beginner' || difficultyName === 'Basic') && !isMissing ? '#111827' : 'white',
    };
    return (
        <div className="difficulty-meter" style={style}>
            {level}
        </div>
    );
};

const parseSmFile = (fileContent) => {
    const lines = fileContent.split('\n');
    let title = 'Unknown Title';
    let titleTranslit = '';
    let artist = 'Unknown Artist';
    let bpmString = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#TITLE:')) {
            title = trimmedLine.substring(7, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        } else if (trimmedLine.startsWith('#TITLETRANSLIT:')) {
            titleTranslit = trimmedLine.substring(14, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        } else if (trimmedLine.startsWith('#ARTIST:')) {
            artist = trimmedLine.substring(8, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        } else if (trimmedLine.startsWith('#BPMS:')) {
            bpmString = trimmedLine.substring(6, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        }
    });

    const difficulties = { singles: {}, doubles: {} };
    const noteSections = fileContent.split('#NOTES:');
    if (noteSections.length > 1) {
        for (let i = 1; i < noteSections.length; i++) {
            const section = noteSections[i];
            const details = section.trim().split(':');
            if (details.length >= 4) {
                const type = details[0].trim().replace('dance-', '');
                const difficulty = details[2].trim();
                const level = details[3].trim();

                if (type === 'single') {
                    difficulties.singles[difficulty] = level;
                } else if (type === 'double') {
                    difficulties.doubles[difficulty] = level;
                }
            }
        }
    }

    return { title, titleTranslit, artist, bpmString, fileContent, difficulties };
};

const getLastBeat = (fileContent) => {
    const noteSections = fileContent.split('#NOTES:');
    if (noteSections.length < 2) return 0;

    let maxBeat = 0;

    for (let i = 1; i < noteSections.length; i++) {
        const section = noteSections[i];
        const chartParts = section.trim().split(':');
        if (chartParts.length < 6) continue;

        const measureData = chartParts.slice(5).join(':').split(';')[0];
        const measuresList = measureData.split(',');

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
            if (lines.length === 0) continue;

            let lastNoteLineIndex = -1;
            for (let k = lines.length - 1; k >= 0; k--) {
                if (/[1234MKLF]/i.test(lines[k])) {
                    lastNoteLineIndex = k;
                    break;
                }
            }

            if (lastNoteLineIndex !== -1) {
                const beatsInMeasure = 4;
                const beatOfLastNote = (lastNoteMeasureIndex * beatsInMeasure) + (lastNoteLineIndex / lines.length) * beatsInMeasure;
                if (beatOfLastNote > maxBeat) {
                    maxBeat = beatOfLastNote;
                }
            }
        }
    }
    return maxBeat;
};


const parseBPMs = (bpmString) => {
    if (!bpmString) return [];
    return bpmString.split(',')
        .filter(entry => entry.includes('='))
        .map(entry => {
            const [beat, bpm] = entry.split('=');
            return { beat: parseFloat(beat), bpm: parseFloat(bpm) };
        })
        .sort((a, b) => a.beat - b.beat);
};

const calculateChartData = (bpmChanges, songLastBeat) => {
    if (bpmChanges.length === 0) return [];

    const dataPoints = [];
    let currentTime = 0;
    let lastBeat = 0;
    let currentBpm = bpmChanges[0].bpm;

    dataPoints.push({ x: 0, y: currentBpm });
    lastBeat = bpmChanges[0].beat; // Should be 0

    for (let i = 1; i < bpmChanges.length; i++) {
        const change = bpmChanges[i];
        const beatsElapsed = change.beat - lastBeat;
        
        if(currentBpm > 0) {
            const segmentDuration = (beatsElapsed / currentBpm) * 60;
            currentTime += segmentDuration;
        }

        dataPoints.push({ x: currentTime, y: currentBpm });
        currentBpm = change.bpm;
        dataPoints.push({ x: currentTime, y: currentBpm });
        
        lastBeat = change.beat;
    }

    const beatsRemaining = songLastBeat - lastBeat;
    if (currentBpm > 0 && beatsRemaining > 0) {
        const finalSegmentDuration = (beatsRemaining / currentBpm) * 60;
        currentTime += finalSegmentDuration;
    }

    dataPoints.push({ x: currentTime, y: currentBpm });

    return dataPoints;
};

const MenuList = ({ options, children, maxHeight, getValue }) => {
    const [value] = getValue();
    const initialOffset = options.indexOf(value) * 35;

    return (
        <List
            height={maxHeight}
            itemCount={children.length}
            itemSize={35}
            initialScrollOffset={initialOffset}
        >
            {({ index, style }) => <div style={style}>{children[index]}</div>}
        </List>
    );
};

import Camera from './Camera';

const getBpmRange = (bpm) => {
  if (typeof bpm !== 'string') return { min: 0, max: 0 };
  const parts = bpm.split('-').map(Number);
  if (parts.length === 1) {
    return { min: parts[0], max: parts[0] };
  }
  return { min: Math.min(...parts), max: Math.max(...parts) };
};

const BPMTool = ({ selectedSong, setSelectedSong, selectedGame, setSelectedGame, targetBPM }) => {
    const [smData, setSmData] = useState({ games: [], files: [] });
    const [songOptions, setSongOptions] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [songMeta, setSongMeta] = useState({ title: '', artist: '', difficulties: { singles: {}, doubles: {} }, bpmDisplay: 'N/A' });
    const [inputValue, setInputValue] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const calculation = useMemo(() => {
        if (!targetBPM || !songMeta.bpmDisplay || songMeta.bpmDisplay === 'N/A') return null;

        const numericTarget = Number(targetBPM) || 0;
        const bpmRange = getBpmRange(songMeta.bpmDisplay);
        
        if (bpmRange.max === 0) return null;

        const idealMultiplier = numericTarget / bpmRange.max;
        const multipliers = [
            ...Array.from({ length: 16 }, (_, i) => 0.25 + i * 0.25),
            ...Array.from({ length: 8 }, (_, i) => 4.5 + i * 0.5),
        ];
        const closestMultiplier = multipliers.reduce((prev, curr) => 
          Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
        );

        const minSpeed = (bpmRange.min * closestMultiplier).toFixed(0);
        const maxSpeed = (bpmRange.max * closestMultiplier).toFixed(0);

        return {
            modifier: closestMultiplier,
            minSpeed: minSpeed,
            maxSpeed: maxSpeed,
            isRange: bpmRange.min !== bpmRange.max
        };
    }, [targetBPM, songMeta.bpmDisplay]);

    const handleCapture = (imageDataUrl) => {
        if (!apiKey) {
            setShowApiKeyModal(true);
            return;
        }
        sendToGemini(imageDataUrl);
    };

    const renderDifficulties = (difficulties, playStyle) => {
        return difficultyLevels.map(levelName => {
            let level = null;
            
            for (const name of difficultyNameMapping[levelName]) {
                if (difficulties[name]) {
                    level = difficulties[name];
                    break;
                }
            }
    
            return <DifficultyMeter key={`${playStyle}-${levelName}`} level={level || 'X'} difficultyName={levelName} isMissing={!level} />;
        });
    };

    useEffect(() => {
        const storedApiKey = localStorage.getItem('geminiApiKey');
        if (storedApiKey) {
            setApiKey(storedApiKey);
        }
    }, []);

    useEffect(() => {
        fetch('/sm-files.json')
            .then(response => response.json())
            .then(data => setSmData(data))
            .catch(error => console.error('Error fetching sm-files.json:', error));
    }, []);

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

    useEffect(() => {
        if (selectedSong) {
            fetch(encodeURI(selectedSong.value))
                .then(response => response.text())
                .then(content => {
                    const metadata = parseSmFile(content);
                    const lastBeat = getLastBeat(metadata.fileContent);
                    
                    const bpmChanges = parseBPMs(metadata.bpmString);
                    let bpmDisplay;
                    if (bpmChanges.length === 0) {
                        bpmDisplay = 'N/A';
                    } else {
                        const bpms = bpmChanges.map(b => b.bpm).filter(bpm => bpm > 0);
                        if (bpms.length === 0) {
                            bpmDisplay = 'N/A';
                        } else if (bpms.length === 1) {
                            bpmDisplay = String(bpms[0]);
                        } else {
                            const minBpm = Math.min(...bpms);
                            const maxBpm = Math.max(...bpms);
                            bpmDisplay = minBpm === maxBpm ? String(minBpm) : `${minBpm}-${maxBpm}`;
                        }
                    }

                    setSongMeta({ 
                        title: metadata.title, 
                        artist: metadata.artist, 
                        difficulties: metadata.difficulties,
                        bpmDisplay: bpmDisplay
                    });

                    const data = calculateChartData(bpmChanges, lastBeat);
                    setChartData(data);
                });
        }
    }, [selectedSong]);

    const selectStyles = {
        control: (styles) => ({ ...styles, backgroundColor: '#374151', border: '1px solid #4B5563', color: 'white', padding: '0.3rem', borderRadius: '0.5rem' }),
        menu: (styles) => ({ ...styles, backgroundColor: '#1F2937' }),
        option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            backgroundColor: isSelected ? '#4A5563' : isFocused ? '#374151' : null,
            color: 'white',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }),
        singleValue: (styles) => ({ 
            ...styles, 
            color: 'white',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }),
        input: (styles) => ({ ...styles, color: 'white' }),
    };

    async function sendToGemini(imageDataUrl) {
        setIsProcessing(true);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite-preview-06-17" });
        const prompt = "From the attached image of a rhythm game screen, identify the song title. Return only the song title and nothing else. If the title is not visible, return 'Unknown'.";
        
        const image = {
            inlineData: {
              data: imageDataUrl.split(',')[1],
              mimeType: "image/jpeg"
            },
        };

        try {
            const result = await model.generateContent([prompt, image]);
            const response = await result.response;
            const text = response.text();
            setInputValue(text);

            const matchedSong = songOptions.find(option =>
                option.title.toLowerCase() === text.toLowerCase() ||
                (option.titleTranslit && option.titleTranslit.toLowerCase() === text.toLowerCase())
            );

            if (matchedSong) {
                setSelectedSong(matchedSong);
            }
        } catch (error) {
            console.error("Error with Gemini API:", error);
            setInputValue("Error identifying song.");
        } finally {
            setIsProcessing(false);
        }
    }

    const handleApiKeySave = (newApiKey) => {
        setApiKey(newApiKey);
        localStorage.setItem('geminiApiKey', newApiKey);
        setShowApiKeyModal(false);
    };

    return (
        <div className="app-container">
            <div className="selection-container">
                <div className="controls-container">
                    <select 
                        className="game-select"
                        value={selectedGame} 
                        onChange={(e) => {
                            setSelectedGame(e.target.value);
                            setSelectedSong(null);
                            setChartData(null);
                        }}
                    >
                        <option value="all">All Games</option>
                        {smData.games.map(game => (
                            <option key={game} value={game}>{game}</option>
                        ))}
                    </select>
                    <div className="song-search-row">
                        <div className="song-select-container">
                            <Select
                                className="song-select"
                                options={songOptions}
                                value={selectedSong}
                                onChange={setSelectedSong}
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
                                    return label.toLowerCase().includes(input) || 
                                           title.toLowerCase().includes(input) || 
                                           (titleTranslit && titleTranslit.toLowerCase().includes(input));
                                }}
                            />
                        </div>
                        <Camera onCapture={handleCapture} isProcessing={isProcessing} />
                    </div>
                </div>
            </div>

            {showApiKeyModal && (
                <div className="api-key-modal">
                    <div className="api-key-modal-content">
                        <h3>Enter your Google AI Studio API Key</h3>
                        <input
                            type="password"
                            defaultValue={apiKey}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleApiKeySave(e.target.value);
                                }
                            }}
                        />
                        <button onClick={() => handleApiKeySave(document.querySelector('.api-key-modal-content input').value)}>Save</button>
                        <button onClick={() => setShowApiKeyModal(false)}>Close</button>
                    </div>
                </div>
            )}

            {chartData && (
                <div className="chart-section">
                    <div className="song-info-bar">
                        <h2 className="song-title">{songMeta.title} - {songMeta.artist}</h2>
                        <div className="details-bar">
                            <div className="difficulties-display">
                                <span className="play-style">SP</span>
                                {renderDifficulties(songMeta.difficulties.singles, 'sp')}
                            </div>
                            <div className="difficulties-display">
                                <span className="play-style">DP</span>
                                {renderDifficulties(songMeta.difficulties.doubles, 'dp')}
                            </div>
                            <div className="bpm-display">
                                <span className="bpm-label">BPM:</span>
                                <span className="bpm-value">{songMeta.bpmDisplay}</span>
                                {calculation && (
                                    <div className="song-calculation">
                                        <span className="song-speed">
                                          {calculation.isRange ? `${calculation.minSpeed}-${calculation.maxSpeed}` : calculation.maxSpeed}
                                        </span>
                                        <span className="song-separator">@</span>
                                        <span className="song-modifier">{calculation.modifier}x</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="chart-container">
                        {chartData && (
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
                                        x: {
                                            type: 'linear',
                                            title: { display: false, text: 'Time (seconds)', color: '#9CA3AF', font: { size: 14, weight: '500' } },
                                            ticks: { color: '#9CA3AF' },
                                            grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                            min: 0,
                                            max: chartData.length > 0 ? chartData[chartData.length - 1].x : 0
                                        },
                                        y: {
                                            title: { display: false, text: 'BPM (Beats Per Minute)', color: '#9CA3AF', font: { size: 14, weight: '500' } },
                                            ticks: { color: '#9CA3AF', stepSize: 10 },
                                            grid: { color: 'rgba(255, 255, 255,.1)' },
                                            min: 0
                                        }
                                    },
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            mode: 'index',
                                            intersect: false,
                                            callbacks: {
                                                title: (tooltipItems) => `Time: ${tooltipItems[0].parsed.x.toFixed(2)}s`,
                                                label: (context) => `BPM: ${context.parsed.y}`
                                            }
                                        }
                                    },
                                    interaction: {
                                      mode: 'nearest',
                                      axis: 'x',
                                      intersect: false
                                    }
                                }}
                            />
                        )}
                    </div>
                </div>
            )}
            <footer className="api-key-footer">
                <button onClick={() => setShowApiKeyModal(true)} className="api-key-button">Set API Key</button>
            </footer>
        </div>
    );
};

export default BPMTool;
