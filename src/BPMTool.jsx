import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import Select from 'react-select';
import { FixedSizeList as List } from 'react-window';
import './BPMTool.css';

const gameFolders = {
    "A3": "sm/A3/",
    "A20Plus": "sm/A20Plus/"
};

const parseSmFile = (fileContent) => {
    const lines = fileContent.split('\n');
    let title = 'Unknown Title';
    let artist = 'Unknown Artist';
    let bpmString = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#TITLE:')) {
            title = trimmedLine.substring(7, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        } else if (trimmedLine.startsWith('#ARTIST:')) {
            artist = trimmedLine.substring(8, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        } else if (trimmedLine.startsWith('#BPMS:')) {
            bpmString = trimmedLine.substring(6, trimmedLine.endsWith(';') ? trimmedLine.length - 1 : undefined);
        }
    });

    return { title, artist, bpmString, fileContent };
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

const BPMTool = () => {
    const [smData, setSmData] = useState({ games: [], files: [] });
    const [selectedGame, setSelectedGame] = useState('all');
    const [selectedSong, setSelectedSong] = useState(null);
    const [songOptions, setSongOptions] = useState([]);
    const [chartData, setChartData] = useState(null);
    const [songMeta, setSongMeta] = useState({ title: '', artist: '' });
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);

    useEffect(() => {
        fetch('/sm-files.json')
            .then(response => response.json())
            .then(data => setSmData(data))
            .catch(error => console.error('Error fetching sm-files.json:', error));
    }, []);

    useEffect(() => {
        let filteredFiles = smData.files;
        if (selectedGame !== 'all') {
            filteredFiles = smData.files.filter(file => file.startsWith(`sm/${selectedGame}/`));
        }
        
        const options = filteredFiles.map(file => {
            const fileName = file.split('/').pop().replace('.sm', '');
            return { value: file, label: fileName };
        });
        setSongOptions(options);
    }, [selectedGame, smData]);

    useEffect(() => {
        if (selectedSong) {
            fetch(encodeURI(selectedSong.value))
                .then(response => response.text())
                .then(content => {
                    const metadata = parseSmFile(content);
                    const lastBeat = getLastBeat(metadata.fileContent);
                    setSongMeta({ title: metadata.title, artist: metadata.artist });
                    const bpmChanges = parseBPMs(metadata.bpmString);
                    const data = calculateChartData(bpmChanges, lastBeat);
                    setChartData(data);
                });
        }
    }, [selectedSong]);

    useEffect(() => {
        if (chartData && chartRef.current) {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            chartInstanceRef.current = new Chart(ctx, {
                type: 'line',
                data: {
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
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear',
                            title: { display: true, text: 'Time (seconds)', color: '#9CA3AF', font: { size: 14, weight: '500' } },
                            ticks: { color: '#9CA3AF' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        y: {
                            title: { display: true, text: 'BPM (Beats Per Minute)', color: '#9CA3AF', font: { size: 14, weight: '500' } },
                            ticks: { color: '#9CA3AF', stepSize: 10 },
                            grid: { color: 'rgba(255, 255, 255,.1)' }
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
                }
            });
        }
    }, [chartData]);

    const selectStyles = {
        control: (styles) => ({ ...styles, backgroundColor: '#374151', border: '1px solid #4B5563', color: 'white' }),
        menu: (styles) => ({ ...styles, backgroundColor: '#1F2937' }),
        option: (styles, { isFocused, isSelected }) => ({
            ...styles,
            backgroundColor: isSelected ? '#4A5563' : isFocused ? '#374151' : null,
            color: 'white',
        }),
        singleValue: (styles) => ({ ...styles, color: 'white' }),
    };

    return (
        <div className="bpm-tool-container">
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
                        />
                    </div>
                </div>
            </div>

            {chartData && (
                <div className="chart-section">
                    <div className="chart-header">
                        <h2>{songMeta.title}</h2>
                        <p>{songMeta.artist}</p>
                    </div>
                    <div className="chart-container">
                        <canvas ref={chartRef}></canvas>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BPMTool;
