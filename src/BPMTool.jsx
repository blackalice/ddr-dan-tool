import React, { lazy, Suspense, useState, useMemo, useContext, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowDownWideShort,
    faArrowUpWideShort,
    faFilter,
    faPlus,
    faSliders,
    faChevronDown,
} from '@fortawesome/free-solid-svg-icons';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import Select, { components as RSComponents } from 'react-select';
import { FixedSizeList as List } from 'react-window';
import { SettingsContext } from './contexts/SettingsContext.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import {
    SONGLIST_OVERRIDE_OPTIONS,
    buildSonglistOverrideLookup,
    songlistOverrideHasEntries,
    songlistOverrideMatches,
} from './utils/songlistOverrides';
import { useFilters } from './contexts/FilterContext.jsx';
import SongInfoBar from './components/SongInfoBar.jsx';
import FilterModal from './components/FilterModal.jsx';
import { useGroups } from './contexts/GroupsContext.jsx';
import AddToListModal from './components/AddToListModal.jsx';
import SortModal from './components/SortModal.jsx';
import { TwoOptionSwitch } from './components/TwoOptionSwitch.jsx';
import { getBpmRange } from './utils/bpm.js';
import { useScores } from './contexts/ScoresContext.jsx';
import { storage } from './utils/remoteStorage.js';
import { computeChartMetrics } from './utils/chartMetrics.js';
import './BPMTool.css';
import { getJsonCached } from './utils/cachedFetch.js';
import { resolveScore } from './utils/scoreKey.js';
import { getDifficultyValue, isDifficultyAllowed } from './utils/difficultyFilters.js';
import { ADVANCED_FILTER_METRICS, chartMatchesAdvancedFilters, hasActiveAdvancedFilters } from './utils/advancedStatsFilters.js';
import { useOfflineMode } from './hooks/useOfflineMode.js';
import SnowfallOverlay from './components/SnowfallOverlay.jsx';

const LazyStepchartPage = lazy(() => import('./components/StepchartPage.jsx').then(({ StepchartPage }) => ({ default: StepchartPage })));
const LazyChartStatsPanel = lazy(() => import('./components/ChartStatsPanel.jsx'));

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
    const initialOffset = useMemo(() => {
        const itemHeight = 35;
        const itemCount = children.length;
        const selectedIndex = options.indexOf(value);
        const targetOffset = selectedIndex >= 0 ? selectedIndex * itemHeight : 0;
        const maxOffset = Math.max(0, itemCount * itemHeight - maxHeight);
        return Math.min(Math.max(0, targetOffset), maxOffset);
    }, [options, value, children.length, maxHeight]);

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

        const input = select.inputRef;

        if (select.state.menuIsOpen) {
            if (input) input.readOnly = false;
            select.onMenuClose();
            select.blurInput();
        } else {
            if (input) input.readOnly = true;
            select.focusInput();
            select.openMenu('first');
        }

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
    'X3 v 2nd', 'X2', 'X', 'SN 2', 'SN',
    'EX', '7th', '6th', '5th', '4th Plus',
    '4th', '3rd', '2nd', 'DDR'
];

const PATTERN_HIGHLIGHT_OPTIONS = [
    { key: 'crossovers', label: 'Crossovers' },
    { key: 'doublesteps', label: 'Doublesteps' },
    { key: 'streams', label: 'Streams' },
    { key: 'bursts', label: 'Bursts' },
];
const PATTERN_HIGHLIGHT_UI_ENABLED = false;

const createDefaultPatternHighlights = () => ({
    crossovers: false,
    doublesteps: false,
    streams: false,
    bursts: false,
});

const normalizePatternHighlights = (value) => {
    const defaults = createDefaultPatternHighlights();
    if (!value || typeof value !== 'object') return defaults;
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
        next[key] = Boolean(value[key]);
    }
    return next;
};

const isKeyboardEntryTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
};


const BPMTool = ({ smData, simfileData, currentChart, setCurrentChart, onSongSelect, selectedGame, view, setView, selectionLoading = false }) => {
    const {
        targetBPM,
        multipliers,
        playStyle,
        songlistOverride,
        showRankedRatings,
        showTransliterationBeta,
        theme,
    } = useContext(SettingsContext);
    const { user } = useAuth();
    const showLists = !!user;
    const { filters } = useFilters();
    const { groups, addChartToGroup, createGroup, addChartsToGroup } = useGroups();
    const { scores, loadSongMeta, songMeta } = useScores();
    const location = useLocation();
    const { offline } = useOfflineMode();


    const [songOptions, setSongOptions] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const savedState = storage.getItem('isCollapsed');
        return savedState ? JSON.parse(savedState) : false;
    });
    const [showAltBpm, setShowAltBpm] = useState(() => {
        const saved = storage.getItem('bpmShowAlt');
        return saved ? JSON.parse(saved) : false;
    });
    const [showAltCoreBpm, setShowAltCoreBpm] = useState(() => {
        const saved = storage.getItem('bpmShowAltCore');
        return saved ? JSON.parse(saved) : false;
    });
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const selectRef = useRef(null);
    const handleMenuClose = () => {
        const input = selectRef.current?.inputRef;
        if (input) {
            input.readOnly = false;
            input.blur();
        }
    };
    const [speedmod, setSpeedmod] = useState(1);
    const [chartChunkColumns, setChartChunkColumns] = useState(() => {
        const saved = Number(storage.getItem('bpmChartChunkColumns'));
        if (Number.isFinite(saved) && saved >= 1 && saved <= 5) {
            return Math.round(saved);
        }
        const legacy = storage.getItem('bpmChartChunkLayout');
        return legacy === 'horizontal5' ? 5 : 1;
    });
    const [chartControlsMinimized, setChartControlsMinimized] = useState(() => {
        const saved = storage.getItem('bpmChartControlsMinimized');
        return saved ? JSON.parse(saved) : false;
    });
    const [patternHighlights, setPatternHighlights] = useState(() => {
        const saved = storage.getItem('bpmPatternHighlights');
        if (!saved) return createDefaultPatternHighlights();
        try {
            return normalizePatternHighlights(JSON.parse(saved));
        } catch {
            return createDefaultPatternHighlights();
        }
    });
    const [showFilter, setShowFilter] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [overrideSongs, setOverrideSongs] = useState(null);
    const [sortKey, setSortKey] = useState(() => storage.getItem('bpmSortKey') || 'title');
    const [sortAscending, setSortAscending] = useState(() => {
        const saved = storage.getItem('bpmSortAsc');
        return saved ? JSON.parse(saved) : true;
    });
    const [showSortModal, setShowSortModal] = useState(false);
    const [audioSeconds, setAudioSeconds] = useState(null);
    const filterCountsCacheRef = useRef(new Map());
    const metricBoundsCacheRef = useRef(new Map());
    const debugChartSelection = typeof window !== 'undefined'
        && window.localStorage?.getItem('debugChartSelection') === '1';
    const handleSongSelectDebug = useCallback((selected) => {
        if (debugChartSelection) {
            console.debug('[BPMTool] song select', {
                selected,
                currentSong: simfileData?.title?.titleName,
                currentChart: currentChart?.slug,
            });
        }
        onSongSelect(selected);
    }, [debugChartSelection, onSongSelect, simfileData?.title?.titleName, currentChart?.slug]);

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
    const chartDevicePixelRatio = useMemo(() => {
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        if (isMobile) return 1;
        return Math.min(dpr, 1.5);
    }, [isMobile]);

    useEffect(() => {
        storage.setItem('bpmChartChunkColumns', String(chartChunkColumns));
    }, [chartChunkColumns]);

    useEffect(() => {
        storage.setItem('bpmChartControlsMinimized', JSON.stringify(chartControlsMinimized));
    }, [chartControlsMinimized]);

    useEffect(() => {
        storage.setItem('bpmPatternHighlights', JSON.stringify(patternHighlights));
    }, [patternHighlights]);

    const togglePatternHighlight = useCallback((patternKey) => {
        setPatternHighlights((prev) => ({
            ...prev,
            [patternKey]: !prev[patternKey],
        }));
    }, []);

    const effectivePatternHighlights = PATTERN_HIGHLIGHT_UI_ENABLED ? patternHighlights : {};

    const updateThemeColors = useCallback(() => {
        const themeRoot = document.querySelector('#root > [data-theme]') || document.documentElement;
        const style = getComputedStyle(themeRoot);
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
    }, [theme, updateThemeColors]);

    const simfileWithRatings = useMemo(() => {
        if (!simfileData) return null;
        const meta = songMeta.find(m => m.title === simfileData.title.titleName && m.game === simfileData.mix.mixName);
        if (!meta) return simfileData;
        const diffMetaByModeDifficulty = new Map(
            (meta.difficulties || []).map(d => [`${d.mode}|${d.difficulty}`, d]),
        );
        const at = simfileData.availableTypes.map(c => {
            const diffMeta = diffMetaByModeDifficulty.get(`${c.mode}|${c.difficulty}`);
            return {
                ...c,
                rankedRating: diffMeta?.rankedRating,
                stepmaniaTech: diffMeta?.stepmaniaTech || null,
            };
        });
        const bySlug = new Map(at.map(c => [c.slug, c]));
        const charts = {};
        for (const [slug, chart] of Object.entries(simfileData.charts || {})) {
            const chartMeta = bySlug.get(slug);
            charts[slug] = {
                ...chart,
                chartId: chartMeta?.chartId ?? chart?.chartId ?? null,
                stepmaniaTech: chartMeta?.stepmaniaTech ?? chart?.stepmaniaTech ?? null,
            };
        }
        return { ...simfileData, availableTypes: at, charts };
    }, [simfileData, songMeta]);
    const ratedChartBySlug = useMemo(() => {
        if (!simfileWithRatings?.availableTypes) return new Map();
        return new Map(simfileWithRatings.availableTypes.map(c => [c.slug, c]));
    }, [simfileWithRatings]);
    const rawChartBySlug = useMemo(() => {
        if (!simfileData?.availableTypes) return new Map();
        return new Map(simfileData.availableTypes.map(c => [c.slug, c]));
    }, [simfileData]);
    const getRatedChart = useCallback((chart) => {
        if (!chart) return chart;
        if (chart.slug && ratedChartBySlug.has(chart.slug)) return ratedChartBySlug.get(chart.slug);
        if (chart.chartId && simfileWithRatings?.availableTypes) {
            const match = simfileWithRatings.availableTypes.find(c => c.chartId === chart.chartId);
            if (match) return match;
        }
        if (chart.mode && chart.difficulty && simfileWithRatings?.availableTypes) {
            const match = simfileWithRatings.availableTypes.find(c => c.mode === chart.mode && c.difficulty === chart.difficulty);
            if (match) return match;
        }
        return chart;
    }, [ratedChartBySlug, simfileWithRatings]);
    const getRawChart = useCallback((chart) => {
        if (!chart) return chart;
        if (chart.slug && rawChartBySlug.has(chart.slug)) return rawChartBySlug.get(chart.slug);
        if (chart.chartId && simfileData?.availableTypes) {
            const match = simfileData.availableTypes.find(c => c.chartId === chart.chartId);
            if (match) return match;
        }
        if (chart.mode && chart.difficulty && simfileData?.availableTypes) {
            const match = simfileData.availableTypes.find(c => c.mode === chart.mode && c.difficulty === chart.difficulty);
            if (match) return match;
        }
        return chart;
    }, [rawChartBySlug, simfileData]);
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
        filters.multiBpm !== 'any' ||
        filters.playedStatus !== 'all' ||
        (showRankedRatings && (filters.rankedFractionMin !== '' || filters.rankedFractionMax !== '')) ||
        hasActiveAdvancedFilters(filters)
    );
    const metadataRequired = showFilter
        || showRankedRatings
        || filtersActive
        || songlistOverride !== SONGLIST_OVERRIDE_OPTIONS[0].value;

    useEffect(() => {
        if (!metadataRequired) return undefined;
        let cancelled = false;
        loadSongMeta({ includeRankedRatings: showRankedRatings })
            .catch((error) => {
                if (!cancelled) console.error('Failed to load song metadata:', error);
            });
        return () => {
            cancelled = true;
        };
    }, [loadSongMeta, metadataRequired, showRankedRatings]);


    const buildFilterCacheKey = useCallback((currentFilters = {}) => {
        const normalized = {
            bpmMin: currentFilters?.bpmMin ?? '',
            bpmMax: currentFilters?.bpmMax ?? '',
            difficultyMin: currentFilters?.difficultyMin ?? '',
            difficultyMax: currentFilters?.difficultyMax ?? '',
            rankedFractionMin: currentFilters?.rankedFractionMin ?? '',
            rankedFractionMax: currentFilters?.rankedFractionMax ?? '',
            lengthMin: currentFilters?.lengthMin ?? '',
            lengthMax: currentFilters?.lengthMax ?? '',
            artist: (currentFilters?.artist || '').toLowerCase(),
            title: (currentFilters?.title || '').toLowerCase(),
            multiBpm: currentFilters?.multiBpm ?? 'any',
            playedStatus: currentFilters?.playedStatus ?? 'all',
            games: Array.isArray(currentFilters?.games) ? [...currentFilters.games].sort() : [],
            difficultyNames: Array.isArray(currentFilters?.difficultyNames) ? [...currentFilters.difficultyNames].map((n) => n.toLowerCase()).sort() : [],
        };
        for (const metric of ADVANCED_FILTER_METRICS) {
            normalized[`${metric.key}Min`] = currentFilters?.[`${metric.key}Min`] ?? '';
            normalized[`${metric.key}Max`] = currentFilters?.[`${metric.key}Max`] ?? '';
        }
        return JSON.stringify(normalized);
    }, []);
    const setCachedResult = (cache, key, value) => {
        cache.set(key, value);
        const maxEntries = 24;
        if (cache.size > maxEntries) {
            const firstKey = cache.keys().next().value;
            if (firstKey !== undefined) cache.delete(firstKey);
        }
        return value;
    };

    const getFilterCounts = useCallback((currentFilters) => {
        if (!smData?.files?.length) return null;
        if (!songMeta.length) return null;
        const cacheKey = `counts|${selectedGame}|${playStyle}|${showRankedRatings ? '1' : '0'}|${buildFilterCacheKey(currentFilters)}`;
        const cached = filterCountsCacheRef.current.get(cacheKey);
        if (cached) return cached;

        const metaMap = new Map(songMeta.map(m => [m.path, m]));
        const gamesFilter = Array.isArray(currentFilters?.games) ? currentFilters.games : [];
        const diffNames = Array.isArray(currentFilters?.difficultyNames) ? currentFilters.difficultyNames : [];
        const lowerCaseFilterNames = diffNames.map(n => n.toLowerCase());
        const artistFilter = (currentFilters?.artist || '').toLowerCase();
        const titleFilter = (currentFilters?.title || '').toLowerCase();
        const bpmMinFilter = currentFilters?.bpmMin ?? '';
        const bpmMaxFilter = currentFilters?.bpmMax ?? '';
        const lengthMinFilter = currentFilters?.lengthMin ?? '';
        const lengthMaxFilter = currentFilters?.lengthMax ?? '';
        const multiBpmFilter = currentFilters?.multiBpm ?? 'any';
        const playedStatusFilter = currentFilters?.playedStatus ?? 'all';
        const rankedFractionMinFilter = currentFilters?.rankedFractionMin ?? '';
        const rankedFractionMaxFilter = currentFilters?.rankedFractionMax ?? '';
        const advancedFiltersActive = hasActiveAdvancedFilters(currentFilters);

        let total = 0;
        let filtered = 0;
        let chartsTotal = 0;
        let chartsFiltered = 0;

        for (const file of smData.files) {
            if (selectedGame !== 'all' && !file.path.startsWith(`sm/${selectedGame}/`)) continue;
            const meta = metaMap.get(file.path);
            if (!meta) continue;
            if (songlistOverrideHasEntries(overrideSongs)) {
                if (!songlistOverrideMatches(overrideSongs, {
                    title: meta.title,
                    titleTranslit: meta.titleTranslit,
                    artist: meta.artist,
                    artistTranslit: meta.artistTranslit,
                    game: meta.game,
                    mode: playStyle,
                })) {
                    continue;
                }
            }

            const chartsInMode = (meta.difficulties || []).filter(d => d.mode === playStyle);
            if (!chartsInMode.length) continue;

            total += 1;
            chartsTotal += chartsInMode.length;

            if (gamesFilter.length && !gamesFilter.includes(meta.game)) continue;
            if (artistFilter && !meta.artist?.toLowerCase()?.includes(artistFilter)) continue;
            if (titleFilter) {
                const titleMatch = meta.title?.toLowerCase()?.includes(titleFilter);
                const translitMatch = meta.titleTranslit?.toLowerCase()?.includes(titleFilter);
                if (!titleMatch && !translitMatch) continue;
            }
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (multiBpmFilter === 'single' && !isSingleBpm) continue;
            if (multiBpmFilter === 'multiple' && isSingleBpm) continue;
            if (bpmMinFilter !== '' && meta.bpmMax < Number(bpmMinFilter)) continue;
            if (bpmMaxFilter !== '' && meta.bpmMin > Number(bpmMaxFilter)) continue;
            if (lengthMinFilter !== '' && meta.length !== undefined && meta.length < Number(lengthMinFilter)) continue;
            if (lengthMaxFilter !== '' && meta.length !== undefined && meta.length > Number(lengthMaxFilter)) continue;
            if (playedStatusFilter !== 'all') {
                const hasPlayedInCurrentPlaystyle = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const scoreHit = resolveScore(scores, d.mode, {
                        chartId: d.chartId,
                        songId: meta.id,
                        title: meta.title,
                        artist: meta.artist,
                        difficulty: d.difficulty,
                    });
                    return scoreHit != null;
                });
                if (playedStatusFilter === 'played' && !hasPlayedInCurrentPlaystyle) continue;
                if (playedStatusFilter === 'notPlayed' && hasPlayedInCurrentPlaystyle) continue;
            }

            const chartMatches = chartsInMode.filter(d => {
                const difficultyValue = getDifficultyValue(d, showRankedRatings);
                const levelMatch = isDifficultyAllowed(
                    difficultyValue,
                    currentFilters?.difficultyMin,
                    currentFilters?.difficultyMax,
                    showRankedRatings,
                    rankedFractionMinFilter,
                    rankedFractionMaxFilter,
                );
                if (!levelMatch) return false;
                const nameMatch = lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(d.difficulty.toLowerCase());
                if (!nameMatch) return false;
                if (advancedFiltersActive && !chartMatchesAdvancedFilters(d, currentFilters)) return false;
                if (playedStatusFilter !== 'all') {
                    const scoreHit = resolveScore(scores, d.mode, {
                        chartId: d.chartId,
                        songId: meta.id,
                        title: meta.title,
                        artist: meta.artist,
                        difficulty: d.difficulty,
                    });
                    const hasScore = scoreHit != null;
                    if (playedStatusFilter === 'played' && !hasScore) return false;
                    if (playedStatusFilter === 'notPlayed' && hasScore) return false;
                }
                return true;
            });

            if (!chartMatches.length) continue;
            filtered += 1;
            chartsFiltered += chartMatches.length;
        }

        return setCachedResult(
            filterCountsCacheRef.current,
            cacheKey,
            { filtered, total, chartsFiltered, chartsTotal },
        );
    }, [smData, songMeta, selectedGame, overrideSongs, playStyle, showRankedRatings, scores, buildFilterCacheKey]);

    const getMetricBounds = useCallback((currentFilters) => {
        if (!smData?.files?.length) return null;
        if (!songMeta.length) return null;
        const cacheKey = `bounds|${selectedGame}|${playStyle}|${showRankedRatings ? '1' : '0'}|${buildFilterCacheKey(currentFilters)}`;
        const cached = metricBoundsCacheRef.current.get(cacheKey);
        if (cached) return cached;

        const metaMap = new Map(songMeta.map(m => [m.path, m]));
        const gamesFilter = Array.isArray(currentFilters?.games) ? currentFilters.games : [];
        const diffNames = Array.isArray(currentFilters?.difficultyNames) ? currentFilters.difficultyNames : [];
        const lowerCaseFilterNames = diffNames.map(n => n.toLowerCase());
        const artistFilter = (currentFilters?.artist || '').toLowerCase();
        const titleFilter = (currentFilters?.title || '').toLowerCase();
        const bpmMinFilter = currentFilters?.bpmMin ?? '';
        const bpmMaxFilter = currentFilters?.bpmMax ?? '';
        const lengthMinFilter = currentFilters?.lengthMin ?? '';
        const lengthMaxFilter = currentFilters?.lengthMax ?? '';
        const multiBpmFilter = currentFilters?.multiBpm ?? 'any';
        const playedStatusFilter = currentFilters?.playedStatus ?? 'all';
        const rankedFractionMinFilter = currentFilters?.rankedFractionMin ?? '';
        const rankedFractionMaxFilter = currentFilters?.rankedFractionMax ?? '';

        const bounds = ADVANCED_FILTER_METRICS.reduce((acc, metric) => {
            acc[metric.key] = { min: Infinity, max: -Infinity, count: 0 };
            return acc;
        }, {});

        for (const file of smData.files) {
            if (selectedGame !== 'all' && !file.path.startsWith(`sm/${selectedGame}/`)) continue;
            const meta = metaMap.get(file.path);
            if (!meta) continue;
            if (songlistOverrideHasEntries(overrideSongs)) {
                if (!songlistOverrideMatches(overrideSongs, {
                    title: meta.title,
                    titleTranslit: meta.titleTranslit,
                    artist: meta.artist,
                    artistTranslit: meta.artistTranslit,
                    game: meta.game,
                    mode: playStyle,
                })) {
                    continue;
                }
            }

            const chartsInMode = (meta.difficulties || []).filter(d => d.mode === playStyle);
            if (!chartsInMode.length) continue;

            if (gamesFilter.length && !gamesFilter.includes(meta.game)) continue;
            if (artistFilter && !meta.artist?.toLowerCase()?.includes(artistFilter)) continue;
            if (titleFilter) {
                const titleMatch = meta.title?.toLowerCase()?.includes(titleFilter);
                const translitMatch = meta.titleTranslit?.toLowerCase()?.includes(titleFilter);
                if (!titleMatch && !translitMatch) continue;
            }
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (multiBpmFilter === 'single' && !isSingleBpm) continue;
            if (multiBpmFilter === 'multiple' && isSingleBpm) continue;
            if (bpmMinFilter !== '' && meta.bpmMax < Number(bpmMinFilter)) continue;
            if (bpmMaxFilter !== '' && meta.bpmMin > Number(bpmMaxFilter)) continue;
            if (lengthMinFilter !== '' && meta.length !== undefined && meta.length < Number(lengthMinFilter)) continue;
            if (lengthMaxFilter !== '' && meta.length !== undefined && meta.length > Number(lengthMaxFilter)) continue;
            if (playedStatusFilter !== 'all') {
                const hasPlayedInCurrentPlaystyle = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const scoreHit = resolveScore(scores, d.mode, {
                        chartId: d.chartId,
                        songId: meta.id,
                        title: meta.title,
                        artist: meta.artist,
                        difficulty: d.difficulty,
                    });
                    return scoreHit != null;
                });
                if (playedStatusFilter === 'played' && !hasPlayedInCurrentPlaystyle) continue;
                if (playedStatusFilter === 'notPlayed' && hasPlayedInCurrentPlaystyle) continue;
            }

            for (const d of chartsInMode) {
                const difficultyValue = getDifficultyValue(d, showRankedRatings);
                if (!isDifficultyAllowed(
                    difficultyValue,
                    currentFilters?.difficultyMin,
                    currentFilters?.difficultyMax,
                    showRankedRatings,
                    rankedFractionMinFilter,
                    rankedFractionMaxFilter,
                )) {
                    continue;
                }
                if (lowerCaseFilterNames.length > 0 && !lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) {
                    continue;
                }
                if (playedStatusFilter !== 'all') {
                    const scoreHit = resolveScore(scores, d.mode, {
                        chartId: d.chartId,
                        songId: meta.id,
                        title: meta.title,
                        artist: meta.artist,
                        difficulty: d.difficulty,
                    });
                    const hasScore = scoreHit != null;
                    if (playedStatusFilter === 'played' && !hasScore) continue;
                    if (playedStatusFilter === 'notPlayed' && hasScore) continue;
                }

                const failingMetricKeys = [];
                for (const metric of ADVANCED_FILTER_METRICS) {
                    const minRaw = currentFilters?.[`${metric.key}Min`] ?? '';
                    const maxRaw = currentFilters?.[`${metric.key}Max`] ?? '';
                    if (minRaw === '' && maxRaw === '') continue;
                    const value = Number(d?.stepmaniaTech?.[metric.key]);
                    const safeValue = Number.isFinite(value) ? value : 0;
                    if (minRaw !== '' && safeValue < Number(minRaw)) {
                        failingMetricKeys.push(metric.key);
                        continue;
                    }
                    if (maxRaw !== '' && safeValue > Number(maxRaw)) {
                        failingMetricKeys.push(metric.key);
                    }
                }
                const failedCount = failingMetricKeys.length;
                const singleFailedKey = failedCount === 1 ? failingMetricKeys[0] : null;

                for (const metric of ADVANCED_FILTER_METRICS) {
                    if (failedCount > 1) continue;
                    if (failedCount === 1 && singleFailedKey !== metric.key) continue;
                    const value = Number(d?.stepmaniaTech?.[metric.key]);
                    const safeValue = Number.isFinite(value) ? value : 0;
                    const entry = bounds[metric.key];
                    entry.min = Math.min(entry.min, safeValue);
                    entry.max = Math.max(entry.max, safeValue);
                    entry.count += 1;
                }
            }
        }

        for (const metric of ADVANCED_FILTER_METRICS) {
            const entry = bounds[metric.key];
            if (!entry || entry.count === 0) {
                bounds[metric.key] = { min: null, max: null, count: 0 };
            }
        }

        return setCachedResult(metricBoundsCacheRef.current, cacheKey, bounds);
    }, [smData, songMeta, selectedGame, overrideSongs, playStyle, showRankedRatings, scores, buildFilterCacheKey]);

    useEffect(() => {
        filterCountsCacheRef.current.clear();
        metricBoundsCacheRef.current.clear();
    }, [smData, songMeta, selectedGame, overrideSongs, playStyle, showRankedRatings, scores]);

    useEffect(() => {
        storage.setItem('isCollapsed', JSON.stringify(isCollapsed));
    }, [isCollapsed]);

    useEffect(() => {
        storage.setItem('bpmShowAlt', JSON.stringify(showAltBpm));
    }, [showAltBpm]);

    useEffect(() => {
        storage.setItem('bpmShowAltCore', JSON.stringify(showAltCoreBpm));
    }, [showAltCoreBpm]);

    useEffect(() => {
        storage.setItem('bpmSortKey', sortKey);
    }, [sortKey]);

    useEffect(() => {
        storage.setItem('bpmSortAsc', JSON.stringify(sortAscending));
    }, [sortAscending]);

    const isLoading = !simfileData;

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Probe exact audio length from server (Worker parses OGG), cached at edge
    useEffect(() => {
        setAudioSeconds(null);
        if (offline) return;
        const musicFile = simfileData?.music;
        const smPath = simfileData?.path;
        if (!musicFile || !smPath) return;
        const u = `/api/song-length?smPath=${encodeURIComponent(smPath)}&music=${encodeURIComponent(musicFile)}`;
        getJsonCached(u, { ttlMs: 7 * 24 * 60 * 60 * 1000 })
            .then(res => {
                const secs = res && (res.roundedSeconds ?? Math.round(res.seconds));
                if (secs && isFinite(secs) && secs > 0 && secs <= 60 * 60) setAudioSeconds(secs);
            })
            .catch(() => {});
    }, [offline, simfileData?.music, simfileData?.path]);

    useEffect(() => {
        if (location.state?.fromSongCard) {
            window.scrollTo(0, 0);
        }
    }, [location.state?.fromSongCard]);


    const chartMetrics = useMemo(() => {
        if ((!simfileWithRatings && !simfileData) || !currentChart) return null;
        const source = simfileWithRatings || simfileData;
        const chart = source?.charts?.[currentChart.slug] || simfileData?.charts?.[currentChart.slug];
        if (!chart) return null;
        try {
            return computeChartMetrics(chart);
        } catch (e) {
            console.warn('Failed to compute chart metrics:', e);
            return null;
        }
    }, [simfileWithRatings, simfileData, currentChart]);

    const statMaxByModeLevel = useMemo(() => {
        const byMode = {
            single: new Map(),
            double: new Map(),
        };
        for (const song of songMeta) {
            for (const diff of song?.difficulties || []) {
                const mode = diff?.mode;
                if (mode !== 'single' && mode !== 'double') continue;
                const level = Number(diff?.feet);
                if (!Number.isFinite(level)) continue;
                const tech = diff?.stepmaniaTech;
                if (!tech || typeof tech !== 'object') continue;
                let levelMax = byMode[mode].get(level);
                if (!levelMax) {
                    levelMax = {};
                    byMode[mode].set(level, levelMax);
                }
                for (const [key, rawValue] of Object.entries(tech)) {
                    const value = Number(rawValue);
                    if (!Number.isFinite(value) || value < 0) continue;
                    const prev = Number(levelMax[key]);
                    if (!Number.isFinite(prev) || value > prev) {
                        levelMax[key] = value;
                    }
                }
            }
        }
        return byMode;
    }, [songMeta]);

    const levelStatMaxima = useMemo(() => {
        const mode = playStyle === 'double' ? 'double' : 'single';
        const level = Number(currentChart?.feet);
        if (!Number.isFinite(level)) return null;
        return statMaxByModeLevel[mode].get(level) || null;
    }, [playStyle, currentChart?.feet, statMaxByModeLevel]);

    useEffect(() => {
        const option = SONGLIST_OVERRIDE_OPTIONS.find(o => o.value === songlistOverride);
        if (!option || !option.file) {
            setOverrideSongs(null);
            return;
        }
        getJsonCached(option.file)
            .then(data => {
                setOverrideSongs(buildSonglistOverrideLookup(data, songMeta));
            })
            .catch(err => { console.error('Failed to load songlist override:', err); setOverrideSongs(null); });
    }, [songlistOverride, songMeta]);

    useEffect(() => {
        if (!simfileWithRatings) return;

        const chartsInMode = simfileWithRatings.availableTypes.filter(c => c.mode === playStyle);
        const deferAdvancedFiltering = hasActiveAdvancedFilters(filters) && songMeta.length === 0;
        const chartExists = currentChart
            ? simfileWithRatings.availableTypes.some(c => c.slug === currentChart.slug)
            : false;
        if (!chartExists) {
            const fallback = chartsInMode[0] || simfileWithRatings.availableTypes[0];
            if (debugChartSelection) {
                console.debug('[BPMTool] Missing chart for song, fallback', {
                    song: simfileWithRatings.title?.titleName,
                    currentSlug: currentChart?.slug,
                    fallbackSlug: fallback?.slug,
                    playStyle,
                });
            }
            if (fallback) setCurrentChart(getRawChart(fallback));
            return;
        }
        if (chartsInMode.length === 0) {
            return;
        }
        if (deferAdvancedFiltering) {
            return;
        }

        const lowerCaseFilterNames = (filters.difficultyNames || []).map(n => n.toLowerCase());

        const isChartFilteredOut = (chart) => {
            const chartForFilter = getRatedChart(chart);
            // Check level range filter
            const chartDifficulty = getDifficultyValue(chartForFilter, showRankedRatings);
            if (!isDifficultyAllowed(chartDifficulty, filters.difficultyMin, filters.difficultyMax, showRankedRatings, filters.rankedFractionMin, filters.rankedFractionMax)) {
                return true;
            }
            // Check difficulty name filter
            if (lowerCaseFilterNames.length > 0) {
                if (!lowerCaseFilterNames.includes(chartForFilter.difficulty.toLowerCase())) {
                    return true;
                }
            }
            if (!chartMatchesAdvancedFilters(chartForFilter, filters)) {
                return true;
            }
            // Check played status filter
            const scoreHit = resolveScore(scores, chartForFilter.mode, {
                chartId: chartForFilter.chartId,
                songId: simfileWithRatings.songId,
                title: simfileWithRatings.title.titleName,
                artist: simfileWithRatings.artist,
                difficulty: chartForFilter.difficulty,
            });
            const hasPlayed = scoreHit != null;

            if (filters.playedStatus === 'played' && !hasPlayed) {
                return true;
            }
            if (filters.playedStatus === 'notPlayed' && hasPlayed) {
                return true;
            }
            return false;
        };

        // Check if the current chart is valid
        const isCurrentChartValid = currentChart && !isChartFilteredOut(currentChart, filters, playStyle, scores, simfileWithRatings);

        if (isCurrentChartValid) {
            return; // Current chart is fine, no need to change
        }

        // Current chart is not valid, find a new one
        const validCharts = chartsInMode.filter(c => !isChartFilteredOut(c, filters, playStyle, scores, simfileWithRatings));

        if (validCharts.length > 0) {
            let newChart = null;
            // Prioritize the first selected difficulty name
            if (lowerCaseFilterNames.length > 0) {
                newChart = validCharts.find(c => c.difficulty.toLowerCase() === lowerCaseFilterNames[0]);
            }
            // Fallback to the closest chart by difficulty value
            if (!newChart && currentChart) {
                const targetDifficulty = getDifficultyValue(currentChart, showRankedRatings);
                if (!Number.isFinite(targetDifficulty)) {
                    newChart = validCharts[0];
                } else {
                    newChart = validCharts.reduce((prev, curr) => {
                        const prevValue = getDifficultyValue(prev, showRankedRatings);
                        const currValue = getDifficultyValue(curr, showRankedRatings);
                        if (!Number.isFinite(prevValue)) return curr;
                        if (!Number.isFinite(currValue)) return prev;
                        return Math.abs(currValue - targetDifficulty) < Math.abs(prevValue - targetDifficulty) ? curr : prev;
                    });
                }
            }
            // Fallback to the first valid chart
            if (!newChart) {
                newChart = validCharts[0];
            }
            setCurrentChart(getRawChart(newChart));
        } else {
            // No valid charts for the current song, try to select a new song
            if (songOptions.length > 0) {
                const currentSongIndex = songOptions.findIndex(opt => opt.title === simfileWithRatings.title.titleName);
                let nextSongIndex = currentSongIndex;
                let newSongFound = false;

                // Iterate through songs to find the next valid one
                for (let i = 0; i < songOptions.length; i++) {
                    nextSongIndex = (currentSongIndex + 1 + i) % songOptions.length;
                    const nextSongOption = songOptions[nextSongIndex];
                    const nextSongMeta = songMeta.find(m => m.title === nextSongOption.title && m.game === nextSongOption.game);

                    if (nextSongMeta) {
                        const nextSongChartsInMode = nextSongMeta.difficulties.filter(d => d.mode === playStyle);
                        const nextSongValidCharts = nextSongChartsInMode.filter(c => !isChartFilteredOut(c, filters, playStyle, scores, nextSongMeta));
                        if (nextSongValidCharts.length > 0) {
                            onSongSelect(nextSongOption);
                            setCurrentChart(getRawChart(nextSongValidCharts[0])); // Select the first valid chart in the new song
                            newSongFound = true;
                            break;
                        }
                    }
                }

                if (!newSongFound) {
                    // If no valid song found at all, clear current song
                    onSongSelect(null);
                }
            } else {
                onSongSelect(null);
            }
        }
    }, [filters, playStyle, simfileData, scores, currentChart, onSongSelect, setCurrentChart, songOptions, songMeta, simfileWithRatings, showRankedRatings, getRatedChart, getRawChart, debugChartSelection]);

    const {
        songTitle,
        artist,
        displayTitle,
        displayArtist,
        gameVersion,
        difficulties,
        bpmDisplay,
        coreBpm,
        chartData,
        songLength,
        jacket,
    } = useMemo(() => {
        if (!simfileWithRatings) {
            const emptyTitle = selectionLoading ? 'Loading song...' : 'Please select';
            const emptyArtist = selectionLoading ? '\u00a0' : 'a song';
            return {
                songTitle: emptyTitle,
                artist: emptyArtist,
                displayTitle: emptyTitle,
                displayArtist: emptyArtist,
                gameVersion: 'NOMIX',
                difficulties: { singles: {}, doubles: {} },
                bpmDisplay: 'N/A',
                coreBpm: null,
                chartData: null,
                songLength: null,
                jacket: null,
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
        let length = null;
        const jacketPath = metaEntry?.jacket || simfileWithRatings?.jacket || simfileData?.jacket || null;

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
                // Prefer canonical length from songMeta when present (ogg-based),
                // then BPM+stops fallback
                const metaEntry = songMeta.find(m => m.title === simfileWithRatings.title.titleName && m.game === simfileWithRatings.mix.mixName);
                if (metaEntry && typeof metaEntry.length === 'number' && metaEntry.length > 0) {
                    length = metaEntry.length;
                } else {
                    length = calculateSongLength(bpmChanges, lastBeat, chartDetails.stops);
                }
            }
        }

        const baseTitle = simfileWithRatings.title.titleName;
        const baseArtist = simfileWithRatings.artist;
        const translitTitle = simfileWithRatings.title.translitTitleName;
        const translitArtist = simfileWithRatings.artistTranslit;
        return {
            songTitle: baseTitle,
            artist: baseArtist,
            displayTitle: showTransliterationBeta && translitTitle ? translitTitle : baseTitle,
            displayArtist: showTransliterationBeta && translitArtist ? translitArtist : baseArtist,
            gameVersion: simfileWithRatings.mix.mixName,
            difficulties: diffs,
            bpmDisplay: display,
            coreBpm: core,
            chartData: data,
            songLength: length,
            jacket: jacketPath,
        };
    }, [simfileWithRatings, simfileData, currentChart, songMeta, showTransliterationBeta, selectionLoading]);

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

    const shouldShowSnowfall = useMemo(() => {
        if (isMobile) return false;
        const title = (songTitle || '').trim().toLowerCase();
        return (
            title === 'thank you merry christmas' ||
            title === 'silent hill' ||
            title === 'silent hill (3rd christmas mix)'
        );
    }, [isMobile, songTitle]);

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

    const resolvedSongLength = (typeof songLength === 'number' && songLength > 0)
        ? songLength
        : audioSeconds;


    useEffect(() => {
        if (!smData.files.length) return;
        const advancedFiltersActive = hasActiveAdvancedFilters(filters);
        const metaLoaded = songMeta.length > 0;
        let filteredFiles = smData.files;
        if (selectedGame !== 'all') {
            filteredFiles = filteredFiles.filter(file => file.path.startsWith(`sm/${selectedGame}/`));
        }

        const metaMap = new Map(songMeta.map(m => [m.path, m]));

        filteredFiles = filteredFiles.filter(file => {
            if (!metaLoaded) {
                if (filters.title) {
                    const input = filters.title.toLowerCase();
                    const titleMatch = file.title.toLowerCase().includes(input);
                    const translitMatch = (file.titleTranslit || '').toLowerCase().includes(input);
                    if (!titleMatch && !translitMatch) return false;
                }
                return true;
            }
            const meta = metaMap.get(file.path);
            if (!meta) return false;
            if (songlistOverrideHasEntries(overrideSongs)) {
                if (!songlistOverrideMatches(overrideSongs, {
                    title: meta.title,
                    titleTranslit: meta.titleTranslit,
                    artist: meta.artist,
                    artistTranslit: meta.artistTranslit,
                    game: meta.game,
                    mode: playStyle,
                })) {
                    return false;
                }
            }
            if (filters.games.length && !filters.games.includes(meta.game)) return false;
            if (filters.artist && !meta.artist.toLowerCase().includes(filters.artist.toLowerCase())) return false;
            if (filters.title && !meta.title.toLowerCase().includes(filters.title.toLowerCase()) && !(meta.titleTranslit && meta.titleTranslit.toLowerCase().includes(filters.title.toLowerCase()))) return false;
            const bpmDiff = meta.bpmMax - meta.bpmMin;
            const isSingleBpm = bpmDiff <= 5;
            if (filters.multiBpm === 'single' && !isSingleBpm) return false;
            if (filters.multiBpm === 'multiple' && isSingleBpm) return false;
            if (filters.bpmMin !== '' && meta.bpmMax < Number(filters.bpmMin)) return false;
            if (filters.bpmMax !== '' && meta.bpmMin > Number(filters.bpmMax)) return false;
            if (
                filters.difficultyMin !== '' ||
                filters.difficultyMax !== '' ||
                (filters.difficultyNames && filters.difficultyNames.length > 0) ||
                (showRankedRatings && (filters.rankedFractionMin !== '' || filters.rankedFractionMax !== '')) ||
                advancedFiltersActive
            ) {
                const lowerCaseFilterNames = (filters.difficultyNames || []).map(n => n.toLowerCase());
                const chartMatches = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const difficultyValue = getDifficultyValue(d, showRankedRatings);
                    const levelMatch = isDifficultyAllowed(difficultyValue, filters.difficultyMin, filters.difficultyMax, showRankedRatings, filters.rankedFractionMin, filters.rankedFractionMax);
                    const nameMatch = lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(d.difficulty.toLowerCase());
                    const advancedMatch = !advancedFiltersActive || chartMatchesAdvancedFilters(d, filters);
                    return levelMatch && nameMatch && advancedMatch;
                });
                if (!chartMatches) return false;
            }
            if (filters.lengthMin !== '' && meta.length !== undefined && meta.length < Number(filters.lengthMin)) return false;
            if (filters.lengthMax !== '' && meta.length !== undefined && meta.length > Number(filters.lengthMax)) return false;

            // Played vs Not Played filter
            if (filters.playedStatus !== 'all') {
            const hasPlayedInCurrentPlaystyle = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false; // Only consider charts of the current playStyle
                    const scoreHit = resolveScore(scores, d.mode, {
                        chartId: d.chartId,
                        songId: meta.id,
                        title: meta.title,
                        artist: meta.artist,
                        difficulty: d.difficulty,
                    });
                    return scoreHit != null;
                });

                if (filters.playedStatus === 'played' && !hasPlayedInCurrentPlaystyle) return false;
                if (filters.playedStatus === 'notPlayed' && hasPlayedInCurrentPlaystyle) return false;
            }

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
            label: showTransliterationBeta && file.titleTranslit ? file.titleTranslit : file.title,
            title: file.title,
            titleTranslit: file.titleTranslit,
            id: file.id,
            songId: file.id,
        }));
        setSongOptions(options);
    }, [selectedGame, smData, songMeta, filters, overrideSongs, sortKey, sortAscending, playStyle, showRankedRatings, showTransliterationBeta, scores]);

    const selectedSongOption = useMemo(() => {
        if (!simfileData) return null;
        const fromList = songOptions.find(opt => opt.value === simfileData.path);
        if (fromList) return fromList;
        const fallbackLabel = showTransliterationBeta && simfileData.title.translitTitleName
            ? simfileData.title.translitTitleName
            : simfileData.title.titleName;
        return {
            value: simfileData.path,
            label: fallbackLabel,
            title: simfileData.title.titleName,
            titleTranslit: simfileData.title.translitTitleName,
        };
    }, [simfileData, songOptions, showTransliterationBeta]);

    const navigateSongByOffset = useCallback((offset) => {
        if (selectionLoading || songOptions.length === 0) return;

        const currentIndex = selectedSongOption
            ? songOptions.findIndex(opt => opt.value === selectedSongOption.value)
            : -1;
        const startIndex = currentIndex >= 0 ? currentIndex : (offset > 0 ? -1 : 0);
        const nextIndex = (startIndex + offset + songOptions.length) % songOptions.length;
        const nextSong = songOptions[nextIndex];
        if (nextSong) {
            handleSongSelectDebug(nextSong);
        }
    }, [handleSongSelectDebug, selectedSongOption, selectionLoading, songOptions]);

    useEffect(() => {
        if (showFilter || showAddModal || showSortModal) return undefined;

        const handleKeyDown = (event) => {
            if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            if (isKeyboardEntryTarget(event.target)) return;

            event.preventDefault();
            navigateSongByOffset(event.key === 'ArrowRight' ? 1 : -1);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigateSongByOffset, showAddModal, showFilter, showSortModal]);

    useEffect(() => {
        if (!simfileData || songOptions.length === 0) return;
        const currentTitle = simfileData.title.titleName;
        const isValid = songOptions.some(opt => opt.title === currentTitle);
        if (!isValid) {
            onSongSelect(songOptions[0]);
        }
    }, [songOptions, simfileData, onSongSelect]);

    useEffect(() => {
        if (!simfileData || !currentChart || !filters) return;
        const deferAdvancedFiltering = hasActiveAdvancedFilters(filters) && songMeta.length === 0;
        if (deferAdvancedFiltering) return;

        const chartExists = currentChart
            ? simfileWithRatings.availableTypes.some(c => c.slug === currentChart.slug)
            : false;
        if (!chartExists) {
            const fallback = simfileWithRatings.availableTypes.find(c => c.mode === playStyle)
                || simfileWithRatings.availableTypes[0];
            if (debugChartSelection) {
                console.debug('[BPMTool] Current chart not in song, fallback', {
                    song: simfileWithRatings.title?.titleName,
                    currentSlug: currentChart?.slug,
                    fallbackSlug: fallback?.slug,
                    playStyle,
                });
            }
            if (fallback) setCurrentChart(getRawChart(fallback));
            return;
        }

        // If the current chart is still valid, do nothing.
        const currentChartDifficulty = getDifficultyValue(currentChart, showRankedRatings);
        const currentChartIsValid =
            isDifficultyAllowed(currentChartDifficulty, filters.difficultyMin, filters.difficultyMax, showRankedRatings, filters.rankedFractionMin, filters.rankedFractionMax) &&
            (!filters.difficultyNames || filters.difficultyNames.length === 0 || filters.difficultyNames.includes(currentChart.difficulty)) &&
            chartMatchesAdvancedFilters(getRatedChart(currentChart), filters);

        if (currentChartIsValid) return;

        // Find a better chart that matches the filters
        const availableCharts = simfileWithRatings.availableTypes.filter(c => c.mode === playStyle);
        const matchingCharts = availableCharts.filter(c => {
            const difficultyValue = getDifficultyValue(c, showRankedRatings);
            return (
                isDifficultyAllowed(difficultyValue, filters.difficultyMin, filters.difficultyMax, showRankedRatings, filters.rankedFractionMin, filters.rankedFractionMax) &&
                (!filters.difficultyNames || filters.difficultyNames.length === 0 || filters.difficultyNames.includes(c.difficulty)) &&
                chartMatchesAdvancedFilters(c, filters)
            );
        });

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
            setCurrentChart(getRawChart(newChart));
        }
    }, [simfileData, simfileWithRatings, filters, playStyle, currentChart, setCurrentChart, showRankedRatings, getRatedChart, getRawChart, songMeta, debugChartSelection]);

    useEffect(() => {
        if (!simfileWithRatings || !currentChart) return;
        const deferAdvancedFiltering = hasActiveAdvancedFilters(filters) && songMeta.length === 0;
        if (deferAdvancedFiltering) return;

        const mode = playStyle;
        const chartsInMode = simfileWithRatings.availableTypes.filter(c => c.mode === mode);

        const matchesFilters = (chart) => {
            const difficultyValue = getDifficultyValue(chart, showRankedRatings);
            return (
                isDifficultyAllowed(difficultyValue, filters.difficultyMin, filters.difficultyMax, showRankedRatings, filters.rankedFractionMin, filters.rankedFractionMax) &&
                chartMatchesAdvancedFilters(chart, filters)
            );
        };

        const matchingCharts = chartsInMode.filter(matchesFilters);

        if (matchingCharts.length === 0) {
            if (songOptions.length > 0 && simfileData.title.titleName !== songOptions[0].title) {
                onSongSelect(songOptions[0]);
            }
            return;
        }

        if (!matchingCharts.find(c => c.slug === currentChart.slug)) {
            const targetDifficulty = getDifficultyValue(currentChart, showRankedRatings);
            if (!Number.isFinite(targetDifficulty)) {
                setCurrentChart(getRawChart(matchingCharts[0]));
                return;
            }
            const closest = matchingCharts.reduce((prev, c) => {
                const prevValue = getDifficultyValue(prev, showRankedRatings);
                const currValue = getDifficultyValue(c, showRankedRatings);
                if (!Number.isFinite(prevValue)) return c;
                if (!Number.isFinite(currValue)) return prev;
                return Math.abs(currValue - targetDifficulty) < Math.abs(prevValue - targetDifficulty) ? c : prev;
            }, matchingCharts[0]);
            setCurrentChart(getRawChart(closest));
        }
    }, [filters, playStyle, simfileData, currentChart, songOptions, onSongSelect, setCurrentChart, simfileWithRatings, showRankedRatings, getRawChart, getRatedChart, songMeta]);

    const selectStyles = {
        control: (styles) => ({
            ...styles,
            backgroundColor: 'var(--bpm-control-bg, var(--card-bg-color))',
            border: '1px solid var(--border-color)',
            color: 'var(--text-color)',
            height: '44px',
            minHeight: '44px',
            padding: 0,
            borderRadius: 'var(--radius-sm)',
        }),
        menu: (styles) => ({
            ...styles,
            backgroundColor: 'var(--bg-color-light)',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            zIndex: 1000,
        }),
        menuList: (styles) => ({
            ...styles,
            borderRadius: 'var(--radius-sm)',
        }),
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

    const saveChartToGroup = (name) => {
        if (!simfileData || !currentChart) return;
        if (!groups.some(g => g.name === name)) {
            createGroup(name);
        }
        const metaEntry = songMeta.find(m => m.title === simfileData.title.titleName && m.game === simfileData.mix.mixName);
        const diffMeta = metaEntry?.difficulties.find(d => d.mode === currentChart.mode && d.difficulty === currentChart.difficulty);
        const chart = {
            title: simfileData.title.titleName,
            titleTranslit: simfileData.title.translitTitleName,
            level: currentChart.feet,
            rankedRating: diffMeta?.rankedRating,
            bpm: bpmDisplay,
            difficulty: currentChart.difficulty.toLowerCase(),
            mode: currentChart.mode,
            game: simfileData.mix.mixName,
            chartId: currentChart.chartId,
            songId: simfileData.songId,
            artist: simfileData.artist,
            artistTranslit: simfileData.artistTranslit,
            path: simfileData.path,
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
        const advancedFiltersActive = hasActiveAdvancedFilters(currentFilters);

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
            if (
                currentFilters.difficultyMin !== '' ||
                currentFilters.difficultyMax !== '' ||
                (currentFilters.difficultyNames && currentFilters.difficultyNames.length > 0) ||
                (showRankedRatings && (currentFilters.rankedFractionMin !== '' || currentFilters.rankedFractionMax !== '')) ||
                advancedFiltersActive
            ) {
                const lowerCaseFilterNames = (currentFilters.difficultyNames || []).map(n => n.toLowerCase());
                const chartMatches = meta.difficulties.some(d => {
                    if (d.mode !== playStyle) return false;
                    const difficultyValue = getDifficultyValue(d, showRankedRatings);
                    const levelMatch = isDifficultyAllowed(difficultyValue, currentFilters.difficultyMin, currentFilters.difficultyMax, showRankedRatings, currentFilters.rankedFractionMin, currentFilters.rankedFractionMax);
                    const nameMatch = lowerCaseFilterNames.length === 0 || lowerCaseFilterNames.includes(d.difficulty.toLowerCase());
                    const advancedMatch = !advancedFiltersActive || chartMatchesAdvancedFilters(d, currentFilters);
                    return levelMatch && nameMatch && advancedMatch;
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
                    const difficultyValue = getDifficultyValue(d, showRankedRatings);
                    if (!isDifficultyAllowed(difficultyValue, currentFilters.difficultyMin, currentFilters.difficultyMax, showRankedRatings, currentFilters.rankedFractionMin, currentFilters.rankedFractionMax)) {
                        return false;
                    }
                    if (lowerCaseFilterNames.length > 0 && !lowerCaseFilterNames.includes(d.difficulty.toLowerCase())) return false;
                    if (advancedFiltersActive && !chartMatchesAdvancedFilters(d, currentFilters)) return false;
                    return true;
                })
                .map(d => ({
                    title: meta.title,
                    titleTranslit: meta.titleTranslit,
                    level: d.feet,
                    rankedRating: d.rankedRating,
                    bpm: `${meta.bpmMin}-${meta.bpmMax}`,
                    difficulty: d.difficulty.toLowerCase(),
                    mode: d.mode,
                    game: meta.game,
                    chartId: d.chartId,
                    songId: meta.id,
                    artist: meta.artist,
                    artistTranslit: meta.artistTranslit,
                    path: meta.path,
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
                        <TwoOptionSwitch
                            ariaLabel="Toggle BPM, chart, and stats views"
                            options={[
                                { value: 'bpm', label: 'BPM' },
                                { value: 'chart', label: 'Chart' },
                                { value: 'stats', label: 'Stats' },
                            ]}
                            value={view}
                            onChange={setView}
                        />
                        <div className="action-buttons mobile-only">
                            {showLists && (
                                <button className="filter-button" onClick={handleAddToList} title="Add to list">
                                    <FontAwesomeIcon icon={faPlus} />
                                </button>
                            )}
                            <button className={`filter-button ${filtersActive ? 'active' : ''}`} onClick={() => setShowFilter(true)}>
                                <FontAwesomeIcon icon={faFilter} />
                            </button>
                            <button className="filter-button" onClick={() => setShowSortModal(true)} title="Sort songs">
                                <FontAwesomeIcon icon={sortAscending ? faArrowUpWideShort : faArrowDownWideShort} />
                            </button>
                        </div>
                    </div>
                    <div className="song-search-row">
                        <div className="song-select-container">
                            <Select
                                ref={selectRef}
                                className="song-select"
                                options={songOptions}
                                value={selectedSongOption}
                                onChange={handleSongSelectDebug}
                                styles={selectStyles}
                                placeholder="Search for a song..."
                                isClearable
                                components={{
                                    MenuList,
                                    ...(isMobile && { DropdownIndicator: MobileDropdownIndicator })
                                }}
                                onMenuClose={handleMenuClose}
                                inputValue={inputValue}
                                onInputChange={setInputValue}
                                selectRef={selectRef}
                                filterOption={(option, rawInput) => {
                                    const { label, data } = option;
                                    const { title, titleTranslit } = data;
                                    const input = rawInput.toLowerCase();
                                    return (
                                        label.toLowerCase().includes(input)
                                        || (title && title.toLowerCase().includes(input))
                                        || (titleTranslit && titleTranslit.toLowerCase().includes(input))
                                    );
                                }}
                            />
                        </div>
                        <div className="action-buttons desktop-only">
                            {showLists && (
                                <button className="filter-button" onClick={handleAddToList} title="Add to list">
                                    <FontAwesomeIcon icon={faPlus} />
                                </button>
                            )}
                            <button className={`filter-button ${filtersActive ? 'active' : ''}`} onClick={() => setShowFilter(true)}>
                                <FontAwesomeIcon icon={faFilter} />
                            </button>
                            <button className="filter-button" onClick={() => setShowSortModal(true)} title="Sort songs">
                                <FontAwesomeIcon icon={sortAscending ? faArrowUpWideShort : faArrowDownWideShort} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`chart-section ${isCollapsed ? 'collapsed' : ''}`}>
                {shouldShowSnowfall && <SnowfallOverlay />}
                <SongInfoBar
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                    gameVersion={gameVersion}
                    jacket={jacket}
                    disableJacket={offline}
                    songTitle={songTitle}
                    artist={artist}
                    displayTitle={displayTitle}
                    displayArtist={displayArtist}
                    playStyle={playStyle}
                    difficulties={difficulties}
                    currentChart={currentChart}
                    setCurrentChart={setCurrentChart}
                    simfileData={simfileWithRatings || simfileData}
                    bpmRange={getBpmRange(bpmDisplay)}
                    bpmDisplay={bpmDisplay}
                    calculation={calculation}
                    showAltBpm={showAltBpm}
                    setShowAltBpm={setShowAltBpm}
                    coreBpm={coreBpm}
                    coreCalculation={coreCalculation}
                    showAltCoreBpm={showAltCoreBpm}
                    setShowAltCoreBpm={setShowAltCoreBpm}
                    songLength={resolvedSongLength}
                    metrics={chartMetrics}
                    view={view}
                />
                {view === 'bpm' ? (
                    <div className="chart-container">
                        {chartData ? (
                            <Line datasetIdKey="bpm" data={{
 datasets: [
      {
        label: 'BPM',
        data: chartData,
        borderColor: themeColors.accentColor,
        // backgroundColor as a function that receives the chart context
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;

          if (!chartArea) return themeColors.accentColor || 'rgba(0,0,0,0.1)';

          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
let rgb = themeColors.accentColorRgb;
if (!rgb && themeColors.accentColor?.startsWith('#')) {
  let c = themeColors.accentColor.replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const n = parseInt(c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
          rgb = `${r}, ${g}, ${b}`;
          }
          if (!rgb) rgb = '0,0,0';
          gradient.addColorStop(0, `rgba(${rgb}, 0.2)`);
          gradient.addColorStop(1, `rgba(${rgb}, 0.0)`);
          return gradient;
        },
        
        stepped: true,
        fill: true,
        pointRadius: 0,
        pointBackgroundColor: themeColors.accentColor,
        pointBorderColor: '#fff',
        pointHoverRadius: isMobile ? 0 : 7,
        borderWidth: 2.5
      }
    ]
  }}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    animation: false,
                                    devicePixelRatio: chartDevicePixelRatio,
                                    events: isMobile ? [] : undefined,
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
                                    interaction: isMobile ? undefined : { mode: 'nearest', axis: 'x', intersect: false }
                                }}
                            />
                        ) : (
                            <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted-color)', textAlign: 'center', padding: '1rem' }}>
                                <p>{isLoading ? '' : 'The BPM chart for the selected song will be displayed here.'}</p>
                            </div>
                        )}
                    </div>
                ) : view === 'chart' ? (
                    <div className="stepchart-view-container">
                        <Suspense fallback={<div className="app-loading">Loading chart…</div>}>
                            <LazyStepchartPage
                                simfile={simfileWithRatings}
                                currentType={currentChart ? currentChart.slug : (simfileWithRatings?.availableTypes?.[0]?.slug)}
                                setCurrentChart={setCurrentChart}
                                isCollapsed={isCollapsed}
                                setIsCollapsed={setIsCollapsed}
                                playStyle={playStyle}
                                speedmod={speedmod}
                                chunkColumns={chartChunkColumns}
                                highlightPatterns={effectivePatternHighlights}
                            />
                        </Suspense>
                    </div>
                ) : (
                        <Suspense fallback={<div className="app-loading">Loading stats…</div>}>
                            <LazyChartStatsPanel
                                metrics={chartMetrics}
                                songLength={resolvedSongLength}
                                chartLevel={currentChart?.feet}
                                levelStatMaxima={levelStatMaxima}
                            />
                        </Suspense>
                )}
                 {view === 'chart' && (
                    chartControlsMinimized ? (
                        <button
                            type="button"
                            className="smod-mini-button"
                            aria-label="Show chart settings"
                            title="Show chart settings"
                            onClick={() => setChartControlsMinimized(false)}
                        >
                            <FontAwesomeIcon icon={faSliders} />
                        </button>
                    ) : (
                        <div className="smod-controls-container">
                            <div className="smod-controls-header">
                                <button
                                    type="button"
                                    className="smod-collapse-button"
                                    aria-label="Hide chart settings"
                                    title="Hide chart settings"
                                    onClick={() => setChartControlsMinimized(true)}
                                >
                                    <FontAwesomeIcon icon={faChevronDown} />
                                </button>
                            </div>
                            <div className="smod-top-row">
                                <div className="smod-control-group">
                                    <div className="smod-label">Columns</div>
                                    <div className="chunk-columns-stepper">
                                        <button
                                            className="smod-button"
                                            onClick={() => setChartChunkColumns((prev) => Math.max(1, prev - 1))}
                                            title="Decrease chart columns"
                                            aria-label="Decrease chart columns"
                                        >
                                            -
                                        </button>
                                        <div className="smod-value">{chartChunkColumns} col</div>
                                        <button
                                            className="smod-button"
                                            onClick={() => setChartChunkColumns((prev) => Math.min(5, prev + 1))}
                                            title="Increase chart columns"
                                            aria-label="Increase chart columns"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div className="smod-control-group">
                                    <div className="smod-label">Speed</div>
                                    <div className="smod-stepper">
                                        <button className="smod-button" onClick={() => setSpeedmod(prev => Math.max(1, prev - 0.5))}>-</button>
                                        <div className="smod-value">{speedmod}x</div>
                                        <button className="smod-button" onClick={() => setSpeedmod(prev => Math.min(3, prev + 0.5))}>+</button>
                                    </div>
                                </div>
                            </div>
                            {PATTERN_HIGHLIGHT_UI_ENABLED ? (
                                <div className="pattern-highlight-group">
                                    <div className="smod-label">Highlights</div>
                                    <div className="pattern-highlight-controls">
                                        {PATTERN_HIGHLIGHT_OPTIONS.map((option) => {
                                            const active = patternHighlights[option.key];
                                            return (
                                                <button
                                                    key={option.key}
                                                    type="button"
                                                    className={`pattern-toggle pattern-toggle-${option.key} ${active ? 'active' : ''}`}
                                                    aria-pressed={active}
                                                    onClick={() => togglePatternHighlight(option.key)}
                                                >
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )
                )}
            </div>
        </div>
        <FilterModal
            isOpen={showFilter}
            onClose={() => setShowFilter(false)}
            games={smData.games}
            showLists={showLists}
            onCreateList={handleCreateListFromFilter}
            getCounts={getFilterCounts}
            getMetricBounds={getMetricBounds}
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
