import { parseSm } from './smParser.js';
import { getJsonCached, getTextCached } from './cachedFetch.js';

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
        
        const mixName = songFile.path.split('/')[1] || 'Unknown Mix';

        return {
            ...parsed,
            path: songFile.path,
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
