import React, { useState, useMemo, useContext, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Select, { components as RSComponents } from 'react-select';
import { FixedSizeList as List } from 'react-window';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { SONGLIST_OVERRIDE_OPTIONS } from './utils/songlistOverrides';
import { normalizeString } from './utils/stringSimilarity';
import { useFilters } from './contexts/FilterContext.jsx';
import { StepchartPage } from './components/StepchartPage.jsx';
import SongInfoBar from './components/SongInfoBar.jsx';
import FilterModal from './components/FilterModal.jsx';
import Camera from './Camera.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import AddToListModal from './components/AddToListModal.jsx';
import SortModal from './components/SortModal.jsx';
import { getBpmRange } from './utils/bpm.js';
import './BPMTool.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// Determine the last beat of a chart using parsed arrow and freeze data.
// This mirrors the logic used in the stepchart view so the BPM and chart
// displays are consistent.
const getLastBeat = (chart) => {
    if (!chart) return 0;

    const lastArrowOffset = chart.arrows.length > 0
        ? chart.arrows[chart.arrows.length - 1].offset + 0.25
        : 0;

    const lastFreezeOffset = chart.freezes.length > 0
        ? chart.freezes[chart.freezes.length - 1].endOffset
        : 0;

    return Math.max(lastArrowOffset, lastFreezeOffset) * 4;
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

const calculateSongLength = (bpmChanges, songLastBeat, stops = []) => {
    if (!bpmChanges || bpmChanges.length === 0) return 0;
    let time = 0;
    let lastBeat = bpmChanges[0].startOffset * 4;
    let currentBpm = bpmChanges[0].bpm;

    for (let i = 1; i < bpmChanges.length; i++) {
        const change = bpmChanges[i];
        const endBeat = change.startOffset * 4;
        const beatsElapsed = endBeat - lastBeat;
        if (currentBpm > 0) {
            time += (beatsElapsed / currentBpm) * 60;
        }
        stops.forEach(s => {
            const beat = s.offset * 4;
            if (beat >= lastBeat && beat < endBeat) {
                time += s.duration;
            }
        });
        currentBpm = change.bpm;
        lastBeat = endBeat;
    }

    const beatsRemaining = songLastBeat - lastBeat;
    if (currentBpm > 0 && beatsRemaining > 0) {
        time += (beatsRemaining / currentBpm) * 60;
    }
    stops.forEach(s => {
        const beat = s.offset * 4;
        if (beat >= lastBeat && beat < songLastBeat) {
            time += s.duration;
        }
    });
    return Math.round(time);
};

const MenuList = ({ options, children, maxHeight, getValue }) => {
    const listRef = React.useRef(null);
    const [value] = getValue();
    const initialOffset = useMemo(() => options.indexOf(value) * 35, [options, value]);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTo(initialOffset);
        }
    }, [initialOffset]);

    return (
        <List
            ref={listRef}
            height={maxHeight}
            itemCount={children.length}
            itemSize={35}
            initialScrollOffset={initialOffset}
        >
            {({ index, style }) => <div style={style}>{children[index]}</div>}
        </List>
    );
};

const MobileDropdownIndicator = (props) => {
    const { selectRef } = props.selectProps;

    const toggleMenu = (e) => {
        if (e && e.type === 'mousedown' && e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        const select = selectRef?.current;
        if (!select) return;

        if (select.state.menuIsOpen) {
            select.setState({ inputIsHiddenAfterUpdate: !select.props.isMulti });
            select.onMenuClose();
        } else {
            select.openMenu('first');
        }

        select.blurInput();
    };

    const innerProps = {
        ...props.innerProps,
        onMouseDown: toggleMenu,
        onTouchEnd: toggleMenu,
    };

    return (
        <RSComponents.DropdownIndicator
            {...props}
            innerProps={innerProps}
        />
    );
};

const DEFAULT_DIFF_ORDER = ['Expert', 'Hard', 'Heavy', 'Challenge', 'Difficult', 'Standard', 'Medium', 'Basic', 'Easy', 'Light', 'Beginner'];

const GAME_VERSION_ORDER = [
    'World', 'A3', 'A20 Plus', 'A20', 'A', '2014', '2013',
    'X3 vs 2ndMix', 'X2', 'X', 'Supernova 2', 'Supernova',
    'Extreme', '7thMix', '6thMix', '5thMix', '4thMix Plus',
    '4thMix', '3rdMix', '2ndMix', 'DDR'
];


const BPMTool = ({ smData, simfileData, currentChart, setCurrentChart, onSongSelect, selectedGame, setSelectedGame, view, setView }) => {
    const { targetBPM, multipliers, apiKey, playStyle, showLists, songlistOverride, showRankedRatings } = useContext(SettingsContext);
    const { filters } = useFilters();
    const { groups, addChartToGroup, createGroup, addChartsToGroup } = useGroups();
    const location = useLocation();
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
    const selectRef = useRef(null);
    const [speedmod, setSpeedmod] = useState(1);
    const [showFilter, setShowFilter] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [songMeta, setSongMeta] = useState([]);
    const [overrideSongs, setOverrideSongs] = useState(null);
    const [sortKey, setSortKey] = useState(() => localStorage.getItem('bpmSortKey') || 'title');
    const [sortAscending, setSortAscending] = useState(() => {
        const saved = localStorage.getItem('bpmSortAsc');
        return saved ? JSON.parse(saved) : true;
    });
    const [showSortModal, setShowSortModal] = useState(false);

    const hexToRgba = (hex, alpha) => {
        let c = hex.replace('#', '').trim();
        if (c.length === 3) {
            c = c.split('').map(ch => ch + ch).join('');
        }
        const num = parseInt(c, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Store theme-dependent colors for the BPM chart
    const [themeColors, setThemeColors] = useState({
        accentColor: '',
        accentColorRgb: '',
        mutedColor: '',
        gridColor: '',
    });

    const updateThemeColors = useCallback(() => {
        const style = getComputedStyle(document.documentElement);
        const border = style.getPropertyValue('--border-color').trim();
        setThemeColors({
            accentColor: style.getPropertyValue('--accent-color').trim(),
            accentColorRgb: style.getPropertyValue('--accent-color-rgb').trim(),
            mutedColor: style.getPropertyValue('--text-muted-color').trim(),
            gridColor: hexToRgba(border, 0.1),
        });
    }, []);

    // Update colors once on mount and whenever the data-theme attribute changes
    useEffect(() => {
        updateThemeColors();
        const observer = new MutationObserver(updateThemeColors);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, [updateThemeColors]);

    const simfileWithRatings = useMemo(() => {
        if (!simfileData) return null;
        const meta = songMeta.find(m => m.title === simfileData.title.titleName && m.game === simfileData.mix.mixName);
        if (!meta) return simfileData;
        const at = simfileData.availableTypes.map(c => {
            const diffMeta = meta.difficulties.find(d => d.mode === c.mode && d.difficulty === c.difficulty);
            return { ...c, rankedRating: diffMeta?.rankedRating };
        });
        return { ...simfileData, availableTypes: at };
    }, [simfileData, songMeta]);
    const filtersActive = Boolean(
        filters.bpmMin !== '' ||
        filters.bpmMax !== '' ||
        filters.difficultyMin !== '' ||
        filters.difficultyMax !== '' ||
        filters.lengthMin !== '' ||
        filters.lengthMax !== '' ||
        filters.games.length > 0 ||
        (filters.difficultyNames && filters.difficultyNames.length > 0) ||
        filters.artist !== '' ||
        (filters.title && filters.title !== '') ||
        filters.multiBpm !== 'any'
    );

    useEffect(() => {
        localStorage.setItem('isCollapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    useEffect(() => {
        localStorage.setItem('bpmSortKey', sortKey);
    }, [sortKey]);

    useEffect(() => {
        localStorage.setItem('bpmSortAsc', JSON.stringify(sortAscending));
    }, [sortAscending]);

    const isLoading = !simfileData;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (location.state?.fromSongCard) {
            window.scrollTo(0, 0);
        }
    }, [location.state?.fromSongCard]);

    useEffect(() => {
        fetch('/song-meta.json')
            .then(res => res.json())
            .then(setSongMeta)
            .catch(err => console.error('Failed to load song meta:', err));
    }, []);

    useEffect(() => {
        const option = SONGLIST_OVERRIDE_OPTIONS.find(o => o.value === songlistOverride);
        if (!option || !option.file) {
            setOverrideSongs(null);
            return;
        }
        fetch(option.file)
            .then(res => res.json())
            .then(data => {
                const songs = (data.songs || []).map(normalizeString);
                setOverrideSongs(new Set(songs));
            })
            .catch(err => { console.error('Failed to load songlist override:', err); setOverrideSongs(null); });
    }, [songlistOverride]);

    useEffect(() => {
        if (!simfileWithRatings) return;

        const chartsInMode = simfileWithRatings.availableTypes.filter(c => c.mode === playStyle);
        if (chartsInMode.length === 0) {
            // If no charts for this play style, do nothing and let the song be filtered out
            return;
        }

        const lowerCaseFilterNames = (filters.difficultyNames || []).map(n => n.toLowerCase());

        // Check if the current chart is valid
        const isCurrentChartValid = currentChart &&
            chartsInMode.some(c => c.slug === currentChart.slug) &&
            (!filters.difficultyMin || currentChart.feet >= Number(filters.difficultyMin)) &&
            (!filters.difficultyMax || currentChart.feet <= Number(filters.difficultyMax)) &&
            (lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(currentChart.difficulty.toLowerCase()));

        if (isCurrentChartValid) {
            return; // Current chart is fine, no need to change
        }

        // Current chart is not valid, find a new one
        const validCharts = chartsInMode.filter(c =>
            (!filters.difficultyMin || c.feet >= Number(filters.difficultyMin)) &&
            (!filters.difficultyMax || c.feet <= Number(filters.difficultyMax)) &&
            (lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(c.difficulty.toLowerCase()))
        );

        if (validCharts.length > 0) {
            let newChart = null;
            // Prioritize the first selected difficulty name
            if (lowerCaseFilterNames.length > 0) {
                newChart = validCharts.find(c => c.difficulty.toLowerCase() === lowerCaseFilterNames[0]);
            }
            // Fallback to the first valid chart
            if (!newChart) {
                newChart = validCharts[0];
            }
            setCurrentChart(newChart);
        } else {
            // The song itself will be filtered out by the other effect,
            // but we can try to find *any* chart for the new playstyle if the mode was just switched.
            if (currentChart && currentChart.mode !== playStyle && chartsInMode.length > 0) {
                setCurrentChart(chartsInMode[0]);
            }
        }
    }, [filters, playStyle, simfileData]);

    const { songTitle, artist, gameVersion, difficulties, bpmDisplay, coreBpm, chartData, songLength } = useMemo(() => {
        if (!simfileWithRatings) {
            return {
                songTitle: 'Please select a song',
                artist: '...',
                gameVersion: '',
                difficulties: { singles: {}, doubles: {} },
                bpmDisplay: 'N/A',
                coreBpm: null,
                chartData: null,
                songLength: 0,
            };
        }

        const diffs = { singles: {}, doubles: {} };
        const metaEntry = songMeta.find(m => m.title === simfileWithRatings.title.titleName && m.game === simfileWithRatings.mix.mixName);
        simfileWithRatings.availableTypes.forEach(chart => {
            const diffMeta = metaEntry?.difficulties.find(d => d.mode === chart.mode && d.difficulty === chart.difficulty);
            const info = { feet: chart.feet, rankedRating: diffMeta?.rankedRating };
            if (chart.mode === 'single') {
                diffs.singles[chart.difficulty] = info;
            } else if (chart.mode === 'double') {
                diffs.doubles[chart.difficulty] = info;
            }
        });

        let display = 'N/A';
        let core = null;
        let data = null;
        let length = 0;

        if (currentChart && simfileWithRatings.charts) {
            const chartDetails = simfileWithRatings.charts[currentChart.slug];
            if (chartDetails) {
                const bpmChanges = chartDetails.bpm;
                const lastBeat = getLastBeat(chartDetails);
                
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
                length = calculateSongLength(bpmChanges, lastBeat, chartDetails.stops);
            }
        }

        return {
            songTitle: simfileWithRatings.title.titleName,
            artist: simfileWithRatings.artist,
            gameVersion: simfileWithRatings.mix.mixName,
            difficulties: diffs,
            bpmDisplay: display,
            coreBpm: core,
            chartData: data,
            songLength: length,
        };
    }, [simfileWithRatings, currentChart]);

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


    useEffect(() => {
        if (!smData.files.length) return;
        let filteredFiles = smData.files;
        if (selectedGame !== 'all') {
            filteredFiles = filteredFiles.filter(file => file.path.startsWith(`sm/${selectedGame}/`));
        }

        if (overrideSongs && overrideSongs.size > 0) {
            filteredFiles = filteredFiles.filter(file => {
                const titles = [file.title];
                if (file.titleTranslit) titles.push(file.titleTranslit);
                const normalized = titles.map(normalizeString);
                return normalized.some(t => overrideSongs.has(t));
            });
        }

        const metaMap = new Map(songMeta.map(m => [m.path, m]));

        filteredFiles = filteredFiles.filter(file => {
            const meta = metaMap.get(file.path);
            if (!meta) return false;
            if (filters.games.length && !filters.games.includes(meta.game)) return false;
            if (filters.artist && !meta.artist.toLowerCase().includes(filters.artist.toLowerCase())) return false;
            if (filters.title && !meta.title.toLowerCase().includes(filters.title.toLowerCase()) && !(meta.titleTranslit && meta.titleTranslit.toLowerCase().includes(filters.title.toLowerCase()))) return false;
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (filters.multiBpm === 'single' && !isSingleBpm) return false;
            if (filters.multiBpm === 'multiple' && isSingleBpm) return false;
            if (filters.bpmMin !== '' && meta.bpmMax < Number(filters.bpmMin)) return false;
            if (filters.bpmMax !== '' && meta.bpmMin > Number(filters.bpmMax)) return false;
            if (filters.difficultyMin !== '' || filters.difficultyMax !== '' || (filters.difficultyNames && filters.difficultyNames.length > 0)) {
                const lowerCaseFilterNames = (filters.difficultyNames || []).map(n => n.toLowerCase());
                const chartMatches = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const levelMatch = filters.difficultyMin === '' || d.feet >= Number(filters.difficultyMin);
                    const levelMaxMatch = filters.difficultyMax === '' || d.feet <= Number(filters.difficultyMax);
                    const nameMatch = lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(d.difficulty.toLowerCase());
                    return levelMatch && levelMaxMatch && nameMatch;
                });
                if (!chartMatches) return false;
            }
            if (filters.lengthMin !== '' && meta.length !== undefined && meta.length < Number(filters.lengthMin)) return false;
            if (filters.lengthMax !== '' && meta.length !== undefined && meta.length > Number(filters.lengthMax)) return false;
            return true;
        });

        const diffForSort = filters.difficultyNames && filters.difficultyNames.length > 0 ?
            filters.difficultyNames[0] : null;

        const getLevel = (meta) => {
            if (!meta) return Infinity;
            if (diffForSort) {
                const d = meta.difficulties.find(x => x.mode === playStyle && x.difficulty === diffForSort);
                if (d) return showRankedRatings && d.rankedRating != null ? d.rankedRating : d.feet;
            }
            for (const name of DEFAULT_DIFF_ORDER) {
                const d = meta.difficulties.find(x => x.mode === playStyle && x.difficulty.toLowerCase() === name.toLowerCase());
                if (d) return showRankedRatings && d.rankedRating != null ? d.rankedRating : d.feet;
            }
            return Infinity;
        };

        const sorted = [...filteredFiles].sort((a, b) => {
            const metaA = metaMap.get(a.path);
            const metaB = metaMap.get(b.path);
            let cmp = 0;
            switch (sortKey) {
                case 'artist':
                    cmp = (metaA?.artist || '').localeCompare(metaB?.artist || '', undefined, { sensitivity: 'base' });
                    break;
                case 'level':
                    cmp = getLevel(metaA) - getLevel(metaB);
                    break;
                case 'bpmHigh':
                    cmp = (metaA?.bpmMax || 0) - (metaB?.bpmMax || 0);
                    break;
                case 'bpmLow':
                    cmp = (metaA?.bpmMin || 0) - (metaB?.bpmMin || 0);
                    break;
                case 'game':
                {
                    const idxA = GAME_VERSION_ORDER.indexOf(metaA?.game);
                    const idxB = GAME_VERSION_ORDER.indexOf(metaB?.game);
                    cmp = (idxA === -1 ? GAME_VERSION_ORDER.length : idxA) - (idxB === -1 ? GAME_VERSION_ORDER.length : idxB);
                    break;
                }
                case 'title':
                default:
                    cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            }
            if (cmp === 0) cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
            return sortAscending ? cmp : -cmp;
        });

        const options = sorted.map(file => ({
            value: file.path,
            label: file.title,
            title: file.title,
            titleTranslit: file.titleTranslit,
        }));
        setSongOptions(options);
    }, [selectedGame, smData, songMeta, filters, overrideSongs, sortKey, sortAscending, playStyle, showRankedRatings]);

    useEffect(() => {
        if (!simfileData || songOptions.length === 0) return;
        const currentTitle = simfileData.title.titleName;
        const isValid = songOptions.some(opt => opt.title === currentTitle);
        if (!isValid) {
            onSongSelect(songOptions[0]);
        }
    }, [songOptions, simfileData]);

    useEffect(() => {
        if (!simfileData || !currentChart || !filters) return;

        // If the current chart is still valid, do nothing.
        const currentChartIsValid =
            (!filters.difficultyMin || currentChart.feet >= Number(filters.difficultyMin)) &&
            (!filters.difficultyMax || currentChart.feet <= Number(filters.difficultyMax)) &&
            (!filters.difficultyNames || filters.difficultyNames.length === 0 || filters.difficultyNames.includes(currentChart.difficulty));

        if (currentChartIsValid) return;

        // Find a better chart that matches the filters
        const availableCharts = simfileWithRatings.availableTypes.filter(c => c.mode === playStyle);
        const matchingCharts = availableCharts.filter(c =>
            (!filters.difficultyMin || c.feet >= Number(filters.difficultyMin)) &&
            (!filters.difficultyMax || c.feet <= Number(filters.difficultyMax)) &&
            (!filters.difficultyNames || filters.difficultyNames.length === 0 || filters.difficultyNames.includes(c.difficulty))
        );

        if (matchingCharts.length > 0) {
            // Prioritize the first difficulty in the filter, if available
            let newChart = null;
            if (filters.difficultyNames && filters.difficultyNames.length > 0) {
                for (const diffName of filters.difficultyNames) {
                    newChart = matchingCharts.find(c => c.difficulty === diffName);
                    if (newChart) break;
                }
            }
            if (!newChart) {
                newChart = matchingCharts[0];
            }
            setCurrentChart(newChart);
        }
    }, [simfileData, filters]);

    useEffect(() => {
        if (!simfileWithRatings || !currentChart) return;

        const mode = playStyle;
        const chartsInMode = simfileWithRatings.availableTypes.filter(c => c.mode === mode);

        const matchesFilters = (chart) => {
            if (filters.difficultyMin !== '' && chart.feet < Number(filters.difficultyMin)) return false;
            if (filters.difficultyMax !== '' && chart.feet > Number(filters.difficultyMax)) return false;
            return true;
        };

        const matchingCharts = chartsInMode.filter(matchesFilters);

        if (matchingCharts.length === 0) {
            if (songOptions.length > 0 && simfileData.title.titleName !== songOptions[0].title) {
                onSongSelect(songOptions[0]);
            }
            return;
        }

        if (!matchingCharts.find(c => c.slug === currentChart.slug)) {
            const targetFeet = currentChart.feet;
            const closest = matchingCharts.reduce((prev, c) => Math.abs(c.feet - targetFeet) < Math.abs(prev.feet - targetFeet) ? c : prev, matchingCharts[0]);
            setCurrentChart(closest);
        }
    }, [filters, playStyle, simfileData, currentChart, songOptions]);

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

    const saveChartToGroup = (name) => {
        if (!simfileData || !currentChart) return;
        if (!groups.some(g => g.name === name)) {
            createGroup(name);
        }
        const metaEntry = songMeta.find(m => m.title === simfileData.title.titleName && m.game === simfileData.mix.mixName);
        const diffMeta = metaEntry?.difficulties.find(d => d.mode === currentChart.mode && d.difficulty === currentChart.difficulty);
        const chart = {
            title: simfileData.title.titleName,
            level: currentChart.feet,
            rankedRating: diffMeta?.rankedRating,
            bpm: bpmDisplay,
            difficulty: currentChart.difficulty.toLowerCase(),
            mode: currentChart.mode,
            game: simfileData.mix.mixName
        };
        addChartToGroup(name, chart);
    };

    const handleAddToList = () => {
        if (!simfileData || !currentChart) return;
        setShowAddModal(true);
    };

    const handleCreateListFromFilter = (currentFilters) => {
        const listName = prompt("Enter a name for the new list:");
        if (!listName || !listName.trim()) return;

        if (!createGroup(listName)) {
            return; // Stop if group creation failed (e.g., duplicate name, max limit reached)
        }

        const metaMap = new Map(songMeta.map(m => [m.path, m]));

        // Re-filter songOptions based on the modal's current filters
        const filteredSongOptions = smData.files.filter(file => {
            const meta = metaMap.get(file.path);
            if (!meta) return false;
            if (currentFilters.games.length && !currentFilters.games.includes(meta.game)) return false;
            if (currentFilters.artist && !meta.artist.toLowerCase().includes(currentFilters.artist.toLowerCase())) return false;
            if (currentFilters.title && !meta.title.toLowerCase().includes(currentFilters.title.toLowerCase()) && !(meta.titleTranslit && meta.titleTranslit.toLowerCase().includes(currentFilters.title.toLowerCase()))) return false;
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (currentFilters.multiBpm === 'single' && !isSingleBpm) return false;
            if (currentFilters.multiBpm === 'multiple' && isSingleBpm) return false;
            if (currentFilters.bpmMin !== '' && meta.bpmMax < Number(currentFilters.bpmMin)) return false;
            if (currentFilters.bpmMax !== '' && meta.bpmMin > Number(currentFilters.bpmMax)) return false;
            if (currentFilters.difficultyMin !== '' || currentFilters.difficultyMax !== '' || (currentFilters.difficultyNames && currentFilters.difficultyNames.length > 0)) {
                const lowerCaseFilterNames = (currentFilters.difficultyNames || []).map(n => n.toLowerCase());
                const chartMatches = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const levelMatch = currentFilters.difficultyMin === '' || d.feet >= Number(currentFilters.difficultyMin);
                    const levelMaxMatch = currentFilters.difficultyMax === '' || d.feet <= Number(currentFilters.difficultyMax);
                    const nameMatch = lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(d.difficulty.toLowerCase());
                    return levelMatch && levelMaxMatch && nameMatch;
                });
                if (!chartMatches) return false;
            }

            if (currentFilters.lengthMin !== '' && meta.length !== undefined && meta.length < Number(currentFilters.lengthMin)) return false;
            if (currentFilters.lengthMax !== '' && meta.length !== undefined && meta.length > Number(currentFilters.lengthMax)) return false;
            return true;
        }).map(file => ({
            value: file.path,
            label: file.title,
            title: file.title,
            titleTranslit: file.titleTranslit,
        }));

        const chartsToAdd = filteredSongOptions.flatMap(song => {
            const meta = metaMap.get(song.value);
            if (!meta) return [];
            const lowerCaseFilterNames = (currentFilters.difficultyNames || []).map(n => n.toLowerCase());

            return meta.difficulties
                .filter(d => {
                    if (d.mode !== playStyle) return false; // Filter by play style
                    if (currentFilters.difficultyMin && d.feet < currentFilters.difficultyMin) return false;
                    if (currentFilters.difficultyMax && d.feet > currentFilters.difficultyMax) return false;
                    if (lowerCaseFilterNames.length > 0 && !lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) return false;
                    return true;
                })
                .map(d => ({
                    title: meta.title,
                    level: d.feet,
                    rankedRating: d.rankedRating,
                    bpm: `${meta.bpmMin}-${meta.bpmMax}`,
                    difficulty: d.difficulty.toLowerCase(),
                    mode: d.mode,
                    game: meta.game,
                }));
        });

        const maxSongsToAdd = 150;
        const truncatedCharts = chartsToAdd.slice(0, maxSongsToAdd);

        if (truncatedCharts.length > 0) {
            addChartsToGroup(listName, truncatedCharts);
            let alertMessage = `Added ${truncatedCharts.length} charts to the new list "${listName}".`;
            if (chartsToAdd.length > maxSongsToAdd) {
                alertMessage += `\n\nNote: The filter matched ${chartsToAdd.length} charts, but the list has been truncated to the first ${maxSongsToAdd}.`;
            }
            alert(alertMessage);
        } else {
            alert("No charts found matching the current filters.");
        }
        setShowFilter(false);
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
                        <div className="action-buttons mobile-only">
                            {apiKey && <Camera onCapture={sendToGemini} isProcessing={isProcessing} />}
                            {showLists && (
                                <button className="filter-button" onClick={handleAddToList} title="Add to list">
                                    <i className="fa-solid fa-plus"></i>
                                </button>
                            )}
                            <button className={`filter-button ${filtersActive ? 'active' : ''}`} onClick={() => setShowFilter(true)}>
                                <i className="fa-solid fa-filter"></i>
                            </button>
                            <button className="filter-button" onClick={() => setShowSortModal(true)} title="Sort songs">
                                <i className={`fa-solid ${sortAscending ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'}`}></i>
                            </button>
                        </div>
                    </div>
                    <div className="song-search-row">
                        <div className="song-select-container">
                            <Select
                                ref={selectRef}
                                className="song-select"
                                options={songOptions}
                                value={simfileData ? { label: simfileData.title.titleName, value: simfileData.title.titleName } : null}
                                onChange={(selected) => onSongSelect(selected)}
                                styles={selectStyles}
                                placeholder="Search for a song..."
                                isClearable
                                components={{
                                    MenuList,
                                    ...(isMobile && { DropdownIndicator: MobileDropdownIndicator })
                                }}
                                inputValue={inputValue}
                                onInputChange={setInputValue}
                                selectRef={selectRef}
                                filterOption={(option, rawInput) => {
                                    const { label, data } = option;
                                    const { titleTranslit } = data;
                                    const input = rawInput.toLowerCase();
                                    return label.toLowerCase().includes(input) || (titleTranslit && titleTranslit.toLowerCase().includes(input));
                                }}
                            />
                        </div>
                        <div className="action-buttons desktop-only">
                            {apiKey && <Camera onCapture={sendToGemini} isProcessing={isProcessing} />}
                            {showLists && (
                                <button className="filter-button" onClick={handleAddToList} title="Add to list">
                                    <i className="fa-solid fa-plus"></i>
                                </button>
                            )}
                            <button className={`filter-button ${filtersActive ? 'active' : ''}`} onClick={() => setShowFilter(true)}>
                                <i className="fa-solid fa-filter"></i>
                            </button>
                            <button className="filter-button" onClick={() => setShowSortModal(true)} title="Sort songs">
                                <i className={`fa-solid ${sortAscending ? 'fa-arrow-up-wide-short' : 'fa-arrow-down-wide-short'}`}></i>
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
                    songLength={songLength}
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
                                        borderColor: themeColors.accentColor,
                                        backgroundColor: `rgba(${themeColors.accentColorRgb}, 0.2)`,
                                        stepped: true,
                                        fill: true,
                                        pointRadius: 4,
                                        pointBackgroundColor: themeColors.accentColor,
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
                                            title: { display: false },
                                            ticks: { color: themeColors.mutedColor },
                                            grid: { color: themeColors.gridColor },
                                            min: 0,
                                            max: chartData.length > 0 ? chartData[chartData.length - 1].x : 0
                                        },
                                        y: {
                                            title: { display: false },
                                            ticks: { color: themeColors.mutedColor, stepSize: 10 },
                                            grid: { color: themeColors.gridColor },
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
                                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                                }}
                            />
                        ) : (
                            <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted-color)', textAlign: 'center', padding: '1rem' }}>
                                <p>{isLoading ? 'Loading chart...' : 'The BPM chart for the selected song will be displayed here.'}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <StepchartPage
                        simfile={simfileWithRatings}
                        currentType={currentChart ? currentChart.slug : (simfileWithRatings?.availableTypes?.[0]?.slug)}
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
        <FilterModal
            isOpen={showFilter}
            onClose={() => setShowFilter(false)}
            games={smData.games}
            showLists={showLists}
            onCreateList={handleCreateListFromFilter}
        />
        <AddToListModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            groups={groups}
            onAdd={saveChartToGroup}
        />
        <SortModal
            isOpen={showSortModal}
            onClose={() => setShowSortModal(false)}
            sortKey={sortKey}
            setSortKey={setSortKey}
            ascending={sortAscending}
            setAscending={setSortAscending}
        />
        </>
    );
};

export default BPMTool;