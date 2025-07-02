import React, { useState, useEffect, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { useLocation, useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';
import './BPMTool.css';

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

const parseSmFile = (fileContent, requestedDifficulty) => {
    const getTagValue = (content, tagName) => {
        const regex = new RegExp(`^#${tagName}:([^;]+);`, 'im');
        const match = content.match(regex);
        return match ? match[1].trim() : '';
    };

    const charts = [];
    const difficulties = { singles: {}, doubles: {} };

    const title = getTagValue(fileContent, 'TITLE');
    const titleTranslit = getTagValue(fileContent, 'TITLETRANSLIT');
    const artist = getTagValue(fileContent, 'ARTIST');
    const globalBpmString = getTagValue(fileContent, 'BPMS');

    if (fileContent.includes('#NOTEDATA:;')) { // SSC file parsing
        const noteDataBlocks = fileContent.split(/#NOTEDATA:;/i).slice(1);
        noteDataBlocks.forEach(block => {
            const difficulty = getTagValue(block, 'DIFFICULTY');
            if (!difficulty) return;

            const type = getTagValue(block, 'STEPSTYPE').replace('dance-', '');
            const meter = getTagValue(block, 'METER');
            const chartBpmString = getTagValue(block, 'BPMS');
            const notesMatch = block.match(/#NOTES:\s*([\s\S]*?);/i);
            const notes = notesMatch ? notesMatch[1].trim() : '';

            charts.push({
                type,
                difficulty,
                meter,
                bpmString: chartBpmString || globalBpmString,
                notes,
            });
        });
    } else { // SM file parsing
        const noteBlocks = fileContent.split(/#NOTES:/i).slice(1);
        noteBlocks.forEach(block => {
            const details = block.trim().split(':');
            if (details.length >= 5) {
                const type = details[0].trim().replace('dance-', '');
                const difficulty = details[2].trim();
                const meter = details[3].trim();
                const notes = details.slice(4).join(':').split(';')[0].trim();

                charts.push({
                    type,
                    difficulty,
                    meter,
                    bpmString: globalBpmString,
                    notes,
                });
            }
        });
    }

    charts.forEach(c => {
        if (c.type === 'single') {
            difficulties.singles[c.difficulty] = c.meter;
        } else if (c.type === 'double') {
            difficulties.doubles[c.difficulty] = c.meter;
        }
    });

    let targetChart;
    if (requestedDifficulty) {
        targetChart = charts.find(c => c.difficulty.toLowerCase() === requestedDifficulty.toLowerCase());
    }
    
    if (!targetChart) {
        const defaultDifficultyOrder = ['Expert', 'Hard', 'Difficult', 'Medium', 'Basic', 'Easy', 'Beginner'];
        for (const d of defaultDifficultyOrder) {
            targetChart = charts.find(c => c.difficulty.toLowerCase() === d.toLowerCase());
            if (targetChart) break;
        }
    }
    
    if (!targetChart && charts.length > 0) {
        targetChart = charts[0];
    }

    return {
        title,
        titleTranslit,
        artist,
        bpmString: targetChart ? targetChart.bpmString : globalBpmString,
        notes: targetChart ? targetChart.notes : '',
        difficulties,
    };
};

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
            const beatOfLastNote = (lastNoteMeasureIndex * beatsInMeasure) + (lastNoteLineIndex / lines.length) * beatsInMeasure;
            return beatOfLastNote;
        }
    }
    return 0;
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

const calculateCoreBpm = (bpmChanges, songLastBeat) => {
    if (bpmChanges.length === 0) return null;
    if (bpmChanges.length === 1) return bpmChanges[0].bpm;

    const bpmDurations = new Map();
    let lastBeat = 0;
    let currentBpm = bpmChanges[0].bpm;

    for (let i = 1; i < bpmChanges.length; i++) {
        const change = bpmChanges[i];
        const beatsElapsed = change.beat - lastBeat;
        
        if (currentBpm > 0) {
            const duration = (beatsElapsed / currentBpm) * 60;
            bpmDurations.set(currentBpm, (bpmDurations.get(currentBpm) || 0) + duration);
        }
        
        currentBpm = change.bpm;
        lastBeat = change.beat;
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

const multipliers = [
  ...Array.from({ length: 16 }, (_, i) => 0.25 + i * 0.25), // 0.25 to 4.0 in 0.25 steps
  ...Array.from({ length: 8 }, (_, i) => 4.5 + i * 0.5),   // 4.5 to 8.0 in 0.5 steps
];

const useQuery = () => {
    return new URLSearchParams(useLocation().search);
}

const BPMTool = ({ selectedGame, setSelectedGame, targetBPM }) => {
    const query = useQuery();
    const navigate = useNavigate();
    const [smData, setSmData] = useState({ games: [], files: [] });
    const [songOptions, setSongOptions] = useState([]);
    const [selectedSong, setSelectedSong] = useState(null);
    const [chartData, setChartData] = useState(null);
    const [songMeta, setSongMeta] = useState({ title: '', artist: '', difficulties: { singles: {}, doubles: {} }, bpmDisplay: 'N/A', coreBpm: null });
    const [inputValue, setInputValue] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showAltBpm, setShowAltBpm] = useState(false);
    const [showAltCoreBpm, setShowAltCoreBpm] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const songTitle = query.get('song');
        if (songTitle && songOptions.length > 0) {
            const matchedSong = songOptions.find(option =>
                option.title.toLowerCase() === songTitle.toLowerCase() ||
                (option.titleTranslit && option.titleTranslit.toLowerCase() === songTitle.toLowerCase())
            );
            if (matchedSong) {
                setSelectedSong(matchedSong);
            }
        } else {
            setSelectedSong(null);
        }
    }, [query, songOptions]);

    const handleSongSelection = (song) => {
        setSelectedSong(song);
        if (song) {
            navigate(`/bpm?song=${encodeURIComponent(song.title)}`);
        } else {
            navigate('/bpm');
        }
    };

    const calculation = useMemo(() => {
        if (!targetBPM || !songMeta.bpmDisplay || songMeta.bpmDisplay === 'N/A') return null;

        const numericTarget = Number(targetBPM) || 0;
        const bpmRange = getBpmRange(songMeta.bpmDisplay);
        
        if (bpmRange.max === 0) return null;

        const idealMultiplier = numericTarget / bpmRange.max;
        
        const closestMultiplier = multipliers.reduce((prev, curr) => 
          Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
        );

        const closestIndex = multipliers.indexOf(closestMultiplier);
        const primarySpeed = (bpmRange.max * closestMultiplier);

        let alternativeMultiplier = null;
        if (primarySpeed > numericTarget) {
            if (closestIndex > 0) alternativeMultiplier = multipliers[closestIndex - 1];
        } else {
            if (closestIndex < multipliers.length - 1) alternativeMultiplier = multipliers[closestIndex + 1];
        }

        const result = {
            primary: {
                modifier: closestMultiplier,
                minSpeed: Math.round(bpmRange.min * closestMultiplier),
                maxSpeed: Math.round(primarySpeed),
                isRange: bpmRange.min !== bpmRange.max
            },
            alternative: null
        };

        if (alternativeMultiplier) {
            const altMaxSpeed = (bpmRange.max * alternativeMultiplier);
            result.alternative = {
                modifier: alternativeMultiplier,
                minSpeed: Math.round(bpmRange.min * alternativeMultiplier),
                maxSpeed: Math.round(altMaxSpeed),
                isRange: bpmRange.min !== bpmRange.max,
                direction: altMaxSpeed > primarySpeed ? 'up' : 'down'
            };
        }
        
        if (result.alternative && result.primary.maxSpeed === result.alternative.maxSpeed) {
            result.alternative = null;
        }

        return result;
    }, [targetBPM, songMeta.bpmDisplay]);

    const coreCalculation = useMemo(() => {
        if (!targetBPM || !songMeta.coreBpm) return null;

        const numericTarget = Number(targetBPM) || 0;
        const idealMultiplier = numericTarget / songMeta.coreBpm;

        const closestMultiplier = multipliers.reduce((prev, curr) => 
          Math.abs(curr - idealMultiplier) < Math.abs(prev - idealMultiplier) ? curr : prev
        );

        const closestIndex = multipliers.indexOf(closestMultiplier);
        const primarySpeed = (songMeta.coreBpm * closestMultiplier);

        let alternativeMultiplier = null;
        if (primarySpeed > numericTarget) {
            if (closestIndex > 0) alternativeMultiplier = multipliers[closestIndex - 1];
        } else {
            if (closestIndex < multipliers.length - 1) alternativeMultiplier = multipliers[closestIndex + 1];
        }

        const result = {
            primary: {
                modifier: closestMultiplier,
                speed: Math.round(primarySpeed),
            },
            alternative: null
        };

        if (alternativeMultiplier) {
            const altSpeed = (songMeta.coreBpm * alternativeMultiplier);
            result.alternative = {
                modifier: alternativeMultiplier,
                speed: Math.round(altSpeed),
                direction: altSpeed > primarySpeed ? 'up' : 'down'
            };
        }
        
        if (result.alternative && result.primary.speed === result.alternative.speed) {
            result.alternative = null;
        }

        return result;
    }, [targetBPM, songMeta.coreBpm]);

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
        const storedApiKey = sessionStorage.getItem('geminiApiKey');
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
            const pathParts = selectedSong.value.split('?difficulty=');
            const filePath = pathParts[0];
            const difficulty = pathParts.length > 1 ? pathParts[1] : null;

            fetch(encodeURI(filePath))
                .then(response => response.text())
                .then(content => {
                    const metadata = parseSmFile(content, difficulty);
                    const lastBeat = getLastBeat(metadata.notes);
                    
                    const bpmChanges = parseBPMs(metadata.bpmString);
                    let bpmDisplay;
                    if (bpmChanges.length === 0) {
                        bpmDisplay = 'N/A';
                    } else {
                        const bpms = bpmChanges.map(b => b.bpm).filter(bpm => bpm > 0);
                        if (bpms.length === 0) {
                            bpmDisplay = 'N/A';
                        } else if (bpms.length === 1) {
                            bpmDisplay = String(Math.round(bpms[0]));
                        } else {
                            const minBpm = Math.round(Math.min(...bpms));
                            const maxBpm = Math.round(Math.max(...bpms));
                            bpmDisplay = minBpm === maxBpm ? String(minBpm) : `${minBpm}-${maxBpm}`;
                        }
                    }

                    const coreBpm = calculateCoreBpm(bpmChanges, lastBeat);

                    setSongMeta({ 
                        title: metadata.title, 
                        artist: metadata.artist, 
                        difficulties: metadata.difficulties,
                        bpmDisplay: bpmDisplay,
                        coreBpm: coreBpm
                    });

                    const data = calculateChartData(bpmChanges, lastBeat);
                    setChartData(data);
                });
        } else {
            setChartData(null);
            setSongMeta({ title: '', artist: '', difficulties: { singles: {}, doubles: {} }, bpmDisplay: 'N/A', coreBpm: null });
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
        sessionStorage.setItem('geminiApiKey', newApiKey);
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
                                    return label.toLowerCase().includes(input) || 
                                           title.toLowerCase().includes(input) || 
                                           (titleTranslit && titleTranslit.toLowerCase().includes(input));
                                }}
                            />
                        </div>
                        {apiKey && <Camera onCapture={handleCapture} isProcessing={isProcessing} />}
                    </div>
                </div>
            </div>

            {showApiKeyModal && (
                <div className="api-key-modal">
                    <div className="api-key-modal-content">
                        <h3>Enter your Google AI Studio API Key</h3>
                        <p className="api-key-disclaimer">Your API key is stored only in your browser's session storage and is sent directly to Google's AI services. It is never sent to our servers.</p>
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
                <div className={`chart-section ${isCollapsed ? 'collapsed' : ''}`}>
                    <div className="song-info-bar">
                        <div className="song-title-container">
                            <h2 className="song-title bpm-title-mobile">{songMeta.title} - {songMeta.artist}</h2>
                            <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
                                <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`}></i>
                            </button>
                        </div>
                        {!isCollapsed && (
                            <div className="details-grid bpm-tool-grid">
                                <div className="grid-item grid-item-sp">
                                    <span className="play-style">SP</span>
                                    <div className="difficulty-meters-container">
                                        {renderDifficulties(songMeta.difficulties.singles, 'sp')}
                                    </div>
                                </div>
                                <div className="grid-item grid-item-bpm">
                                    <span className="bpm-label">BPM:</span>
                                    <div className="bpm-value-container">
                                        <span className="bpm-value">{songMeta.bpmDisplay}</span>
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
                                            <button 
                                                className={`toggle-button ${showAltBpm && calculation.alternative ? (calculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`}
                                                onClick={() => setShowAltBpm(!showAltBpm)}
                                            >
                                                <i className={`fa-solid ${calculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="grid-item grid-item-dp">
                                    <span className="play-style">DP</span>
                                    <div className="difficulty-meters-container">
                                        {renderDifficulties(songMeta.difficulties.doubles, 'dp')}
                                    </div>
                                </div>
                                <div className="grid-item grid-item-core">
                                    <span className="core-bpm-label">CORE:</span>
                                    <div className="core-bpm-value-container">
                                        <span className="core-bpm-value">{songMeta.coreBpm ? songMeta.coreBpm.toFixed(0) : 'N/A'}</span>
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
                                            <button 
                                                className={`toggle-button ${showAltCoreBpm && coreCalculation.alternative ? (coreCalculation.alternative.direction === 'up' ? 'up' : 'down') : ''}`}
                                                onClick={() => setShowAltCoreBpm(!showAltCoreBpm)}
                                            >
                                                <i className={`fa-solid ${coreCalculation.alternative.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
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
                                            enabled: !isMobile,
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