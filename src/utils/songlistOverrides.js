import { normalizeString } from './stringSimilarity.js';
import { normalizeSongKey } from './chartIdentity.js';

const RELEASE_ORDER = [
    'DDR',
    '2nd',
    '3rd',
    '4th',
    '4th Plus',
    '5th',
    '6th',
    '7th',
    'EX',
    'SN1',
    'SN2',
    'X',
    'X2',
    'X3 vs 2nd',
    '2013',
    '2014',
    'A',
    'A20',
    'A20 Plus',
    'A3',
    'World',
];

const RELEASE_RANKS = new Map(RELEASE_ORDER.map((release, index) => [release, index]));
const RELEASE_ALIASES = new Map([
    ['2ND', '2nd'],
    ['3RD', '3rd'],
    ['4TH', '4th'],
    ['4THPLUS', '4th Plus'],
    ['6TH', '6th'],
    ['7TH', '7th'],
    ['DDRX', 'X'],
    ['XNAEU', 'X'],
    ['DDRX2', 'X2'],
    ['X2NAEU', 'X2'],
    ['DDRX3VS2ND', 'X3 vs 2nd'],
    ['DDRA', 'A'],
    ['DDRANA', 'A'],
    ['DDRA20', 'A20'],
    ['DDRA20NA', 'A20'],
    ['DDRA20PLUS', 'A20 Plus'],
    ['DDRA20PLUSNA', 'A20 Plus'],
    ['DDRA3', 'A3'],
    ['DDRWORLD', 'World'],
    ['WORLD', 'World'],
    ['WORLDEU', 'World'],
]);

const normalizeReleaseValue = (value) => {
    if (!value) return null;
    const raw = String(value).trim();
    if (RELEASE_RANKS.has(raw)) return raw;
    return RELEASE_ALIASES.get(raw.toUpperCase().replace(/[^A-Z0-9]/g, '')) || null;
};

const getReleaseRank = (value) => {
    const release = normalizeReleaseValue(value);
    return release ? RELEASE_RANKS.get(release) : null;
};

const SONGLIST_OVERRIDE_OPTIONS_BY_RELEASE = [
    { value: 'none', label: 'None', game: 'none', gameLabel: 'None', variant: 'none', variantLabel: 'Default', file: null },
    { value: 'DDR', label: 'DDR', game: 'DDR', gameLabel: 'DDR', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR-mainline.json' },
    { value: '2nd', label: 'DDR 2ndMix', game: '2nd', gameLabel: 'DDR 2ndMix', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR2ND-mainline.json' },
    { value: '3rd', label: 'DDR 3rdMix', game: '3rd', gameLabel: 'DDR 3rdMix', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR3RD-mainline.json' },
    { value: '4th', label: 'DDR 4thMix', game: '4th', gameLabel: 'DDR 4thMix', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR4TH-mainline.json' },
    { value: '4th Plus', label: 'DDR 4thMix Plus', game: '4th Plus', gameLabel: 'DDR 4thMix Plus', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR4THPLUS-mainline.json' },
    { value: '5th', label: 'DDR 5thMix', game: '5th', gameLabel: 'DDR 5thMix', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR5TH-mainline.json' },
    { value: '6th', label: 'DDRMAX', game: '6th', gameLabel: 'DDRMAX', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR6TH-mainline.json' },
    { value: '7th', label: 'DDRMAX2', game: '7th', gameLabel: 'DDRMAX2', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR7TH-mainline.json' },
    { value: 'EX', label: 'DDR EXTREME', game: 'EX', gameLabel: 'DDR EXTREME', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDREX-mainline.json' },
    { value: 'SN1', label: 'DDR SuperNOVA', game: 'SN1', gameLabel: 'DDR SuperNOVA', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRSN1-mainline.json' },
    { value: 'SN2', label: 'DDR SuperNOVA 2', game: 'SN2', gameLabel: 'DDR SuperNOVA 2', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRSN2-mainline.json' },
    { value: 'X', label: 'DDR X', game: 'X', gameLabel: 'DDR X', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRX-mainline.json' },
    { value: 'X North America Europe', label: 'DDR X - North America / Europe', game: 'X', gameLabel: 'DDR X', variant: 'north-america-europe', variantLabel: 'North America / Europe', file: '/ddr-ver/DDRX-north-america-europe.json' },
    { value: 'X2', label: 'DDR X2', game: 'X2', gameLabel: 'DDR X2', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRX2-mainline.json' },
    { value: 'X2 North America Europe', label: 'DDR X2 - North America / Europe', game: 'X2', gameLabel: 'DDR X2', variant: 'north-america-europe', variantLabel: 'North America / Europe', file: '/ddr-ver/DDRX2-north-america-europe.json' },
    { value: 'X3 vs 2nd', label: 'DDR X3 vs 2ndMix', game: 'X3 vs 2nd', gameLabel: 'DDR X3 vs 2ndMix', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRX3VS2ND-mainline.json' },
    { value: '2013', label: 'DDR 2013', game: '2013', gameLabel: 'DDR 2013', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR2013-mainline.json' },
    { value: '2014', label: 'DDR 2014', game: '2014', gameLabel: 'DDR 2014', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDR2014-mainline.json' },
    { value: 'A', label: 'DDR A', game: 'A', gameLabel: 'DDR A', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRA-mainline.json' },
    { value: 'A North America', label: 'DDR A - North America', game: 'A', gameLabel: 'DDR A', variant: 'north-america', variantLabel: 'North America', file: '/ddr-ver/DDRA-north-america.json' },
    { value: 'A20', label: 'DDR A20', game: 'A20', gameLabel: 'DDR A20', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRA20-mainline.json' },
    { value: 'A20 North America', label: 'DDR A20 - North America', game: 'A20', gameLabel: 'DDR A20', variant: 'north-america', variantLabel: 'North America', file: '/ddr-ver/DDRA20-north-america.json' },
    { value: 'A20 Plus', label: 'DDR A20 Plus', game: 'A20 Plus', gameLabel: 'DDR A20 Plus', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRA20PLUS-mainline.json' },
    { value: 'A20 Plus North America', label: 'DDR A20 Plus - North America', game: 'A20 Plus', gameLabel: 'DDR A20 Plus', variant: 'north-america', variantLabel: 'North America', file: '/ddr-ver/DDRA20PLUS-north-america.json' },
    { value: 'A3', label: 'DDR A3', game: 'A3', gameLabel: 'DDR A3', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRA3-mainline.json' },
    { value: 'World', label: 'DDR WORLD', game: 'World', gameLabel: 'DDR WORLD', variant: 'mainline', variantLabel: 'Mainline', file: '/ddr-ver/DDRWORLD-mainline.json' },
    { value: 'WORLD-EU', label: 'DDR WORLD - Europe', game: 'World', gameLabel: 'DDR WORLD', variant: 'eu', variantLabel: 'Europe', file: '/ddr-ver/DDRWORLD-eu.json' },
    {
        value: 'A3-flower-no-unlocks',
        label: 'DDR A3 - Flower, No Unlocks',
        game: 'A3',
        gameLabel: 'DDR A3',
        variant: 'flower-no-unlocks',
        variantLabel: 'Flower, No Unlocks',
        file: '/ddr-ver/DDRA3-flower-no-unlocks.json',
    },
];

// Keep the neutral default first, then present releases newest-to-oldest.
export const SONGLIST_OVERRIDE_OPTIONS = [
    SONGLIST_OVERRIDE_OPTIONS_BY_RELEASE[0],
    ...SONGLIST_OVERRIDE_OPTIONS_BY_RELEASE
        .slice(1)
        .sort((a, b) => getReleaseRank(b.game) - getReleaseRank(a.game)),
];

const SONGLIST_OVERRIDE_ALIASES = new Map([
    ['A3 Japan', 'A3'],
    ['A3 mainline', 'A3'],
    ['A3 generated', 'A3'],
    ['A20 Plus Japan', 'A20 Plus'],
    ['A20 Plus mainline', 'A20 Plus'],
    ['A20 Plus generated', 'A20 Plus'],
]);

export const normalizeSonglistOverrideValue = (value) => SONGLIST_OVERRIDE_ALIASES.get(value) || value;

export const findSonglistOverrideOption = (value) => {
    const normalized = normalizeSonglistOverrideValue(value);
    return SONGLIST_OVERRIDE_OPTIONS.find((opt) => opt.value === normalized) || SONGLIST_OVERRIDE_OPTIONS[0];
};

export const SONGLIST_OVERRIDE_GAME_OPTIONS = SONGLIST_OVERRIDE_OPTIONS.reduce((games, option) => {
    if (!games.some((game) => game.value === option.game)) {
        games.push({ value: option.game, label: option.gameLabel });
    }
    return games;
}, []);

export const getSonglistOverrideGameValue = (value) => findSonglistOverrideOption(value).game;

export const getSonglistOverrideVariantOptions = (gameValue) =>
    SONGLIST_OVERRIDE_OPTIONS
        .filter((option) => option.game === gameValue)
        .map((option) => ({
            value: option.variant,
            label: option.variantLabel,
            overrideValue: option.value,
        }));

export const getSonglistOverrideVariantValue = (value) => findSonglistOverrideOption(value).variant;

export const getSonglistOverrideValueForGameVariant = (gameValue, variantValue) => {
    const variants = getSonglistOverrideVariantOptions(gameValue);
    const selected = variants.find((variant) => variant.value === variantValue) || variants[0];
    return selected?.overrideValue || SONGLIST_OVERRIDE_OPTIONS[0].value;
};

const buildArtistKey = (titleKey, artistKey) => `${titleKey}|${artistKey}`;

const buildDuplicatePreferences = (songs = []) => {
    const titleGroups = new Map();
    const titleReleaseCounts = new Map();
    const titleArtistReleaseCounts = new Map();
    for (const song of songs) {
        if (!song || typeof song !== 'object') continue;
        const rank = getReleaseRank(song.game);
        if (!Number.isInteger(rank)) continue;
        const titleKeys = [song.title, song.titleTranslit]
            .filter(Boolean)
            .map(normalizeString)
            .filter(Boolean);
        for (const titleKey of new Set(titleKeys)) {
            let group = titleGroups.get(titleKey);
            if (!group) {
                group = new Map();
                titleGroups.set(titleKey, group);
            }
            const existing = group.get(rank) || new Set();
            existing.add(normalizeReleaseValue(song.game));
            group.set(rank, existing);
            let counts = titleReleaseCounts.get(titleKey);
            if (!counts) {
                counts = new Map();
                titleReleaseCounts.set(titleKey, counts);
            }
            counts.set(rank, (counts.get(rank) || 0) + 1);
            const artistKeys = [song.artist, song.artistTranslit]
                .filter(Boolean)
                .map(normalizeString)
                .filter(Boolean);
            for (const artistKey of new Set(artistKeys)) {
                const artistGroupKey = buildArtistKey(titleKey, artistKey);
                let artistCounts = titleArtistReleaseCounts.get(artistGroupKey);
                if (!artistCounts) {
                    artistCounts = new Map();
                    titleArtistReleaseCounts.set(artistGroupKey, artistCounts);
                }
                artistCounts.set(rank, (artistCounts.get(rank) || 0) + 1);
            }
        }
    }

    const duplicateTitles = new Map();
    for (const [titleKey, ranks] of titleGroups.entries()) {
        if (ranks.size <= 1) continue;
        duplicateTitles.set(titleKey, [...ranks.keys()].sort((a, b) => a - b));
    }
    const duplicateTitlesByRelease = new Map();
    for (const [titleKey, counts] of titleReleaseCounts.entries()) {
        const duplicateRanks = [...counts.entries()]
            .filter(([, count]) => count > 1)
            .map(([rank]) => rank);
        if (duplicateRanks.length) duplicateTitlesByRelease.set(titleKey, duplicateRanks);
    }
    const duplicateTitleArtistsByRelease = new Map();
    for (const [key, counts] of titleArtistReleaseCounts.entries()) {
        const duplicateRanks = [...counts.entries()]
            .filter(([, count]) => count > 1)
            .map(([rank]) => rank);
        if (duplicateRanks.length) duplicateTitleArtistsByRelease.set(key, duplicateRanks);
    }
    return { duplicateTitles, duplicateTitlesByRelease, duplicateTitleArtistsByRelease };
};

const getPreferredDuplicateRank = (lookup, titleKeys, songGame) => {
    const targetRank = lookup?.targetRank;
    if (!Number.isInteger(targetRank)) return null;
    const songRank = getReleaseRank(songGame);
    if (!Number.isInteger(songRank)) return null;

    for (const titleKey of titleKeys) {
        const duplicateRanks = lookup.duplicateTitles?.get(titleKey);
        if (!duplicateRanks?.length) continue;
        const eligibleRanks = duplicateRanks.filter((rank) => rank <= targetRank);
        const preferredRank = eligibleRanks.length
            ? eligibleRanks[eligibleRanks.length - 1]
            : duplicateRanks[0];
        return preferredRank;
    }
    return null;
};

export const buildSonglistOverrideLookup = (data, songs = []) => {
    const titleOnly = new Set();
    const titleArtist = new Map();
    const pathEntries = new Map();
    const overrideSongs = Array.isArray(data?.songs) ? data.songs : [];
    for (const entry of overrideSongs) {
        if (typeof entry === 'string') {
            const key = normalizeString(entry);
            if (key) titleOnly.add(key);
            continue;
        }
        if (!entry || typeof entry !== 'object') continue;
        const songKey = normalizeSongKey(entry.path || entry.songKey || entry.file || entry.songPath);
        if (songKey) {
            pathEntries.set(songKey, entry);
            continue;
        }
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
    return {
        titleOnly,
        titleArtist,
        pathEntries,
        targetRank: getReleaseRank(data?.version),
        ...buildDuplicatePreferences(songs),
    };
};

export const songlistOverrideHasEntries = (lookup) =>
    Boolean(lookup && (lookup.titleOnly.size || lookup.titleArtist.size || lookup.pathEntries?.size));

const getModeDifficulties = (entry, mode) => {
    if (!entry || !mode) return null;
    const list = entry.difficulties?.[mode];
    return Array.isArray(list) ? list : null;
};

const difficultyNames = (list) => (Array.isArray(list) ? list.map((item) => {
    if (typeof item === 'string') return item;
    return item?.name || item?.difficulty || '';
}).map((item) => String(item).trim().toLowerCase()).filter(Boolean) : []);

const pathEntryMatches = (entry, mode, difficulty) => {
    if (!entry || !mode) return Boolean(entry);
    const modeList = getModeDifficulties(entry, mode);
    if (modeList === null) return true;
    if (modeList.length === 0) return false;
    if (!difficulty) return true;
    return difficultyNames(modeList).includes(String(difficulty).trim().toLowerCase());
};

export const songlistOverrideMatches = (
    lookup,
    { path, songKey, title, titleTranslit, artist, artistTranslit, mode, difficulty, game }
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

    const canonicalSongKey = normalizeSongKey(songKey || path);
    if (canonicalSongKey && lookup.pathEntries?.has(canonicalSongKey)) {
        return pathEntryMatches(lookup.pathEntries.get(canonicalSongKey), mode, difficulty);
    }

    // Do not allow a legacy title entry to match a path entry. This keeps a
    // migrated override exact even when another file has the same title.
    if (canonicalSongKey && lookup.pathEntries?.size) {
        const hasAnyCanonicalEntries = [...lookup.pathEntries.values()].some((entry) => {
            const entryTitle = entry.title || entry.songTitle || entry.name || entry.song;
            return entryTitle && titleKeys.includes(normalizeString(entryTitle));
        });
        if (hasAnyCanonicalEntries) return false;
    }

    for (const titleKey of titleKeys) {
        for (const artistKey of artistKeys) {
            const entry = lookup.titleArtist.get(buildArtistKey(titleKey, artistKey));
            if (!entry) continue;
            const artistDuplicateRanks = lookup.duplicateTitleArtistsByRelease
                ?.get(buildArtistKey(titleKey, artistKey)) || [];
            if (artistDuplicateRanks.includes(getReleaseRank(game))) return false;
            const modeList = getModeDifficulties(entry, mode);
            if (mode && Array.isArray(modeList) && modeList.length === 0) return false;
            const preferredRank = getPreferredDuplicateRank(lookup, titleKeys, game);
            if (Number.isInteger(preferredRank) && getReleaseRank(game) !== preferredRank) {
                return false;
            }
            return pathEntryMatches(entry, mode, difficulty);
        }
        if (lookup.titleOnly.has(titleKey)) {
            const duplicateRanks = lookup.duplicateTitlesByRelease?.get(titleKey) || [];
            if (duplicateRanks.includes(getReleaseRank(game))) return false;
            const preferredRank = getPreferredDuplicateRank(lookup, titleKeys, game);
            if (Number.isInteger(preferredRank) && getReleaseRank(game) !== preferredRank) {
                return false;
            }
            return true;
        }
    }
    return false;
};

export const songlistOverrideChartMatches = (lookup, details) =>
    songlistOverrideMatches(lookup, details);
