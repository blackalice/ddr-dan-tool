import { parseSm } from './smParser.js';

let smFilesCache = null;

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

export const findSongByTitle = async (title) => {
    if (!smFilesCache) {
        smFilesCache = await fetchJson('/sm-files.json');
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
        const response = await fetch(encodeURI(`/${songFile.path}`));
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const parsed = parseSm(text);
        
        const mixName = songFile.path.split('/')[1] || 'Unknown Mix';

        return {
            ...parsed,
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
