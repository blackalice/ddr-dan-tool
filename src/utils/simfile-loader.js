import { parseSm } from './smParser.js';
import { getJsonCached, getTextCached } from './cachedFetch.js';
import { buildChartId } from './chartIds.js';
import { normalizeSongIdValue } from './songId.js';

let smFilesCache = null;

export const findSongByTitle = async (title) => {
    if (!smFilesCache) {
        smFilesCache = await getJsonCached('/sm-files.json');
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

        return {
            ...parsed,
            songId,
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
    } catch (error) {
        console.error('Error fetching or parsing sm file:', error);
        return null;
    }
};
