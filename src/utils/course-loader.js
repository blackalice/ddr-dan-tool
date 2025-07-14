import { parseSm } from './smParser.js';

// --- Data Cache ---
let smFilesCache = null;
let courseDataCache = null;
let processedDataCache = null; // In-memory cache for the current session

const CACHE_KEY = 'processedCourseData';

// --- Utility Functions ---
const fetchJson = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error fetching JSON from ${url}:`, error);
        return null;
    }
};

const fetchSmFile = async (path) => {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const smText = await response.text();
        return parseSm(smText);
    } catch (error) {
        console.error(`Error fetching or parsing .sm file from ${path}:`, error);
        return null;
    }
};

const findSongFile = (title, smFiles) => {
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedTitle = normalize(title);
    
    return smFiles.files.find(file => 
        normalize(file.title) === normalizedTitle || 
        (file.titleTranslit && normalize(file.titleTranslit) === normalizedTitle)
    );
};

// --- Main Data Loading Logic ---
export const loadCourseData = async () => {
    // 1. Try loading from localStorage first for persistence across page loads
    try {
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            console.log("Loaded processed course data from localStorage.");
            processedDataCache = JSON.parse(cachedData);
            return processedDataCache;
        }
    } catch (error) {
        console.error("Failed to read from localStorage:", error);
    }

    // 2. If not in localStorage, check the in-memory cache (for the current session)
    if (processedDataCache) {
        return processedDataCache;
    }

    // 3. If no cache exists, fetch and process the data
    if (!smFilesCache) {
        smFilesCache = await fetchJson('/sm-files.json');
    }
    if (!courseDataCache) {
        courseDataCache = await fetchJson('/course-data.json');
    }

    if (!smFilesCache || !courseDataCache) {
        console.error("Failed to load required data.");
        return { dan: { single: [], double: [] }, vega: [] };
    }

    const processCourseList = async (courses) => {
        if (!courses) return [];
        const processedCourses = [];

        for (const course of courses) {
            const processedSongs = [];
            for (const shortCode of course.charts) {
                const parts = shortCode.split(':');
                const mode = parts.pop();
                const difficulty = parts.pop();
                const title = parts.join(':');
                
                const songFile = findSongFile(title, smFilesCache);
                if (!songFile) {
                    console.warn(`Song not found for short code: ${shortCode}`);
                    processedSongs.push({
                        title,
                        difficulty,
                        mode,
                        error: 'Song file not found',
                    });
                    continue;
                }

                const simfileData = await fetchSmFile(`/${songFile.path}`);
                if (!simfileData) {
                    processedSongs.push({
                        title,
                        difficulty,
                        mode,
                        error: 'Failed to load simfile',
                    });
                    continue;
                }

                const chart = simfileData.availableTypes.find(c => c.difficulty === difficulty && c.mode === mode);
                if (!chart) {
                    processedSongs.push({
                        title,
                        difficulty,
                        mode,
                        error: 'Chart not found in simfile',
                    });
                    continue;
                }

                const chartDetails = simfileData.charts[chart.slug];
                const bpms = chartDetails.bpm.map(b => b.bpm).filter(b => b > 0);
                const bpmDisplay = bpms.length === 1 
                    ? String(Math.round(bpms[0])) 
                    : `${Math.round(Math.min(...bpms))}-${Math.round(Math.max(...bpms))}`;

                const game = songFile.path.split('/')[1] || 'N/A';

                processedSongs.push({
                    title: simfileData.title,
                    level: chart.feet,
                    bpm: bpmDisplay,
                    difficulty: chart.difficulty,
                    mode: chart.mode,
                    game: game,
                });
            }
            processedCourses.push({ ...course, songs: processedSongs });
        }
        return processedCourses;
    };

    const processedDanSingle = await processCourseList(courseDataCache.dan.single);
    const processedDanDouble = await processCourseList(courseDataCache.dan.double);
    const processedVega = await processCourseList(courseDataCache.vega);

    const result = {
        dan: {
            single: processedDanSingle,
            double: processedDanDouble,
        },
        vega: processedVega,
    };

    // 4. Store the result in both caches
    processedDataCache = result; // In-memory cache
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(result));
        console.log("Saved processed course data to localStorage.");
    } catch (error) {
        console.error("Failed to save to localStorage:", error);
    }

    return result;
};
