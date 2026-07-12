import { parseSm } from './smParser.js';
import { getJsonCached, getTextCached } from './cachedFetch.js';
import { buildChartId } from './chartIds.js';
import { normalizeSongIdValue } from './songId.js';

let smFilesCache = null;
const SONG_INDEX_PATH = '/song-index.json';
// Parsed simfiles are considerably more expensive than their cached text. Keep a
// small working set so changing charts, navigating away, and returning to a song
// does not parse the same .sm file again on the main thread.
const SIMFILE_CACHE_LIMIT = 12;
const simfileDataCache = new Map();
const simfileLoadPromises = new Map();

function cacheSimfile(key, data) {
    simfileDataCache.delete(key);
    simfileDataCache.set(key, data);
    if (simfileDataCache.size > SIMFILE_CACHE_LIMIT) {
        const oldestKey = simfileDataCache.keys().next().value;
        simfileDataCache.delete(oldestKey);
    }
}

export const findSongByTitle = async (title) => {
    if (!smFilesCache) {
        smFilesCache = await getJsonCached(SONG_INDEX_PATH);
    }
    if (!smFilesCache) return null;

    const normalizedTitle = title.toLowerCase();
    return smFilesCache.files.find(file =>
        file.title.toLowerCase() === normalizedTitle ||
        (file.titleTranslit && file.titleTranslit.toLowerCase() === normalizedTitle)
    );
};

export const loadSimfileData = async (songFile) => {
    if (!songFile || !songFile.path) {
        console.error("Invalid song file provided to loadSimfileData");
        return null;
    }

    const cacheKey = songFile.path;
    const cached = simfileDataCache.get(cacheKey);
    if (cached) {
        // Refresh the entry so frequently revisited songs remain in the working set.
        cacheSimfile(cacheKey, cached);
        return cached;
    }
    if (simfileLoadPromises.has(cacheKey)) {
        return simfileLoadPromises.get(cacheKey);
    }

    const loadPromise = (async () => {
      try {
        const text = await getTextCached(encodeURI(`/${songFile.path}`));
        const parsed = parseSm(text);
        const songId = normalizeSongIdValue(songFile.id || songFile.songId || null);
        const availableTypes = parsed.availableTypes.map(c => ({
            ...c,
            chartId: buildChartId(songId, c.mode, c.difficulty),
        }));
        const charts = {};
        for (const [slug, chart] of Object.entries(parsed.charts || {})) {
            const meta = availableTypes.find(c => c.slug === slug);
            charts[slug] = { ...chart, chartId: meta?.chartId || null };
        }

        const mixName = songFile.path.split('/')[1] || 'Unknown Mix';

        const data = {
            ...parsed,
            songId,
            jacket: songFile.jacket || '',
            availableTypes,
            charts,
            path: songFile.path,
            artistTranslit: parsed.artisttranslit || '',
            title: {
                titleName: parsed.title,
                translitTitleName: parsed.titletranslit,
                titleDir: parsed.title,
                banner: parsed.banner,
            },
            mix: {
                mixName: mixName,
                mixDir: mixName,
            },
        };
        cacheSimfile(cacheKey, data);
        return data;
      } catch (error) {
        console.error('Error fetching or parsing sm file:', error);
        return null;
      } finally {
        simfileLoadPromises.delete(cacheKey);
      }
    })();
    simfileLoadPromises.set(cacheKey, loadPromise);
    return loadPromise;
};
