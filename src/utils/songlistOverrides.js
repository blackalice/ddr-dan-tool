import { normalizeString } from './stringSimilarity.js';

export const SONGLIST_OVERRIDE_OPTIONS = [
    { value: 'none', label: 'None', file: null },
    { value: 'DDR', label: 'DDR', file: '/ddr-ver/DDR-full.json' },
    { value: '2nd', label: 'DDR 2ndMix', file: '/ddr-ver/DDR2ND-full.json' },
    { value: '3rd', label: 'DDR 3rdMix', file: '/ddr-ver/DDR3RD-full.json' },
    { value: '4th', label: 'DDR 4thMix', file: '/ddr-ver/DDR4TH-full.json' },
    { value: '4th Plus', label: 'DDR 4thMix Plus', file: '/ddr-ver/DDR4THPLUS-full.json' },
    { value: '5th', label: 'DDR 5thMix', file: '/ddr-ver/DDR5TH-full.json' },
    { value: '6th', label: 'DDRMAX', file: '/ddr-ver/DDR6TH-full.json' },
    { value: '7th', label: 'DDRMAX2', file: '/ddr-ver/DDR7TH-full.json' },
    { value: 'EX', label: 'DDR EXTREME', file: '/ddr-ver/DDREX-full.json' },
    { value: 'SN1', label: 'DDR SuperNOVA', file: '/ddr-ver/DDRSN1-full.json' },
    { value: 'SN2', label: 'DDR SuperNOVA 2', file: '/ddr-ver/DDRSN2-full.json' },
    { value: 'X', label: 'DDR X', file: '/ddr-ver/DDRX-full.json' },
    { value: 'X2', label: 'DDR X2', file: '/ddr-ver/DDRX2-full.json' },
    { value: 'X3 vs 2nd', label: 'DDR X3 vs 2ndMix', file: '/ddr-ver/DDRX3VS2ND-full.json' },
    { value: '2013', label: 'DDR 2013', file: '/ddr-ver/DDR2013-full.json' },
    { value: '2014', label: 'DDR 2014', file: '/ddr-ver/DDR2014-full.json' },
    { value: 'A', label: 'DDR A', file: '/ddr-ver/DDRA-full.json' },
    { value: 'A20', label: 'DDR A20', file: '/ddr-ver/DDRA20-full.json' },
    { value: 'A20 Plus generated', label: 'DDR A20 Plus', file: '/ddr-ver/DDRA20PLUS-generated-full.json' },
    { value: 'A3 generated', label: 'DDR A3', file: '/ddr-ver/DDRA3-generated-full.json' },
    { value: 'World', label: 'DDR WORLD', file: '/ddr-ver/DDRWORLD-full.json' },
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
