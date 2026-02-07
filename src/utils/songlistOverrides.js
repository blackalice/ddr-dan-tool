import { normalizeString } from './stringSimilarity.js';

export const SONGLIST_OVERRIDE_OPTIONS = [
    { value: 'none', label: 'None', file: null },
    { value: 'WORLD-EU', label: 'DDR WORLD - Europe', file: '/ddr-ver/DDRWORLD-EU-full.json' },
    { value: 'A3', label: 'DDR A3 - Japan', file: '/ddr-ver/DDRA3-full.json' },
    {
        value: 'A3-flower-no-unlocks',
        label: 'DDR A3 - Flower, No Unlocks',
        file: '/ddr-ver/DDRA3-flower-no-unlocks.json',
    },
    { value: 'A20 Plus', label: 'A20 Plus - Japan', file: '/ddr-ver/DDRA20PLUS-full.json' },
];

const buildArtistKey = (titleKey, artistKey) => `${titleKey}|${artistKey}`;

export const buildSonglistOverrideLookup = (data) => {
    const titleOnly = new Set();
    const titleArtist = new Map();
    const songs = Array.isArray(data?.songs) ? data.songs : [];
    for (const entry of songs) {
        if (typeof entry === 'string') {
            const key = normalizeString(entry);
            if (key) titleOnly.add(key);
            continue;
        }
        if (!entry || typeof entry !== 'object') continue;
        const title = entry.title || entry.songTitle || entry.name || entry.song;
        const artist = entry.artist || entry.songArtist || '';
        if (!title) continue;
        const titleKey = normalizeString(title);
        if (!titleKey) continue;
        if (artist) {
            const artistKey = normalizeString(artist);
            titleArtist.set(buildArtistKey(titleKey, artistKey), entry);
        } else {
            titleOnly.add(titleKey);
        }
    }
    return { titleOnly, titleArtist };
};

export const songlistOverrideHasEntries = (lookup) =>
    Boolean(lookup && (lookup.titleOnly.size || lookup.titleArtist.size));

const getModeDifficulties = (entry, mode) => {
    if (!entry || !mode) return null;
    const list = entry.difficulties?.[mode];
    return Array.isArray(list) ? list : null;
};

export const songlistOverrideMatches = (
    lookup,
    { title, titleTranslit, artist, artistTranslit, mode }
) => {
    if (!songlistOverrideHasEntries(lookup)) return true;
    const titleKeys = [title, titleTranslit]
        .filter(Boolean)
        .map(normalizeString)
        .filter(Boolean);
    const artistKeys = [artist, artistTranslit]
        .filter(Boolean)
        .map(normalizeString)
        .filter(Boolean);

    for (const titleKey of titleKeys) {
        for (const artistKey of artistKeys) {
            const entry = lookup.titleArtist.get(buildArtistKey(titleKey, artistKey));
            if (!entry) continue;
            const modeList = getModeDifficulties(entry, mode);
            if (mode && Array.isArray(modeList) && modeList.length === 0) {
                return false;
            }
            return true;
        }
        if (lookup.titleOnly.has(titleKey)) return true;
    }
    return false;
};
