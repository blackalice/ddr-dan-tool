import { parseSm } from './smParser.js';

// --- Data Cache ---
let smFilesCache = null;
let courseDataCache = null;

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

    return {
        dan: {
            single: processedDanSingle,
            double: processedDanDouble,
        },
        vega: processedVega,
    };
};
