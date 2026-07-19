#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeString } from '../src/utils/stringSimilarity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_ORDER = ['DDR', '2nd', '3rd', '4th', '4th Plus', '5th', '6th', '7th', 'EX', 'SN1', 'SN2', 'X', 'X2', 'X3 vs 2nd', '2013', '2014', 'A', 'A20', 'A20 Plus', 'A3', 'World'];
const rank = new Map(RELEASE_ORDER.map((value, index) => [value, index]));
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const meta = await readJson(path.join(ROOT, 'public', 'song-meta.json'));
const titleCandidates = new Map();
for (const song of meta) {
    for (const title of [song.title, song.titleTranslit].filter(Boolean)) {
        const key = normalizeString(title);
        if (!titleCandidates.has(key)) titleCandidates.set(key, []);
        titleCandidates.get(key).push(song);
    }
}

// These source lists contain one title for a known duplicate-title family.
// Use the entry whose metadata matches the documented source song/variant.
const explicitLegacyPaths = new Map([
    ['X|howtoplay', 'sm/X/HOW TO PLAY/HOW TO PLAY.sm'],
    ['SN2|sunkissdrop', 'sm/SN2/SUNKiSS DROP~jun Side~/SUNKiSS DROP~jun Side~.sm'],
    ['X2|leaving', 'sm/X2/Leaving/Leaving.sm'],
    ['X2|melodylife', 'sm/X2/Melody Life/Melody Life.sm'],
]);
const LA_BAMBA_EX_PATH = 'sm/EX/LA BAMBA/LA BAMBA.sm';
const LA_BAMBA_LH_PATH = 'sm/SN1/La Bamba/La Bamba.sm';

const baseVersion = (value) => {
    const raw = String(value || '');
    if (raw.startsWith('DDRA20PLUS')) return 'A20 Plus';
    if (raw.startsWith('DDRA20')) return 'A20';
    if (raw.startsWith('DDRWORLD') || raw.startsWith('WORLD')) return 'World';
    if (raw.startsWith('DDRX3VS2ND')) return 'X3 vs 2nd';
    if (raw.startsWith('DDRX2')) return 'X2';
    if (raw.startsWith('DDRX')) return 'X';
    if (raw.startsWith('DDRA3')) return 'A3';
    if (raw.startsWith('DDRA')) return 'A';
    if (raw.startsWith('DDR2014')) return '2014';
    if (raw.startsWith('DDR2013')) return '2013';
    if (raw.startsWith('DDR')) return raw.replace(/^DDR/, '') || 'DDR';
    return raw;
};

const chooseCandidates = (entry, version) => {
    const title = typeof entry === 'string'
        ? entry
        : entry?.title || entry?.songTitle || entry?.name || entry?.song;
    const artist = typeof entry === 'object' && entry
        ? entry.artist || entry.songArtist || ''
        : '';
    const candidates = (titleCandidates.get(normalizeString(title)) || []).filter((song) => {
        if (!artist) return true;
        return [song.artist, song.artistTranslit].filter(Boolean)
            .some((value) => normalizeString(value) === normalizeString(artist));
    });
    const preferred = candidates.filter((song) => (rank.get(song.game) ?? -1) <= (rank.get(version) ?? Infinity));
    const pool = preferred.length ? preferred : candidates;
    const bestRank = Math.max(...pool.map((song) => rank.get(song.game) ?? -1));
    return pool.filter((song) => (rank.get(song.game) ?? -1) === bestRank);
};

const migrateEntry = (entry, version) => {
    if (entry && typeof entry === 'object' && (entry.path || entry.songKey || entry.file || entry.songPath)) {
        return { path: entry.path || entry.songKey || entry.file || entry.songPath };
    }
    const title = typeof entry === 'string'
        ? entry
        : entry?.title || entry?.songTitle || entry?.name || entry?.song;
    const artist = typeof entry === 'object' && entry
        ? entry.artist || entry.songArtist || ''
        : '';
    const manual = !artist && explicitLegacyPaths.get(`${version}|${normalizeString(title)}`);
    let paths = manual ? [manual] : chooseCandidates(entry, version).map((song) => song.path);
    paths = [...new Set(paths)];
    if (!paths.length) return null;
    return paths.map((songPath) => {
        return { path: songPath };
    });
};

for (const name of (await fs.readdir(path.join(ROOT, 'data', 'ddr-ver'))).filter((value) => value.endsWith('.json'))) {
    const file = path.join(ROOT, 'data', 'ddr-ver', name);
    let data;
    try { data = await readJson(file); } catch { continue; }
    const version = baseVersion(data.version || name);
    const migrated = [];
    const seenPaths = new Set();
    for (const entry of Array.isArray(data.songs) ? data.songs : []) {
        const next = migrateEntry(entry, version);
        const items = Array.isArray(next) ? next : (next ? [next] : []);
        for (const item of items) {
            const songPath = item?.path || item?.songKey;
            if (songPath && seenPaths.has(songPath)) continue;
            if (songPath) seenPaths.add(songPath);
            migrated.push(item);
        }
    }
    const versionRank = rank.get(version) ?? -1;
    const laBambaPaths = new Set([LA_BAMBA_EX_PATH, LA_BAMBA_LH_PATH]);
    const withoutLaBamba = migrated.filter((entry) => !laBambaPaths.has(entry?.path));
    if (versionRank >= rank.get('EX')) withoutLaBamba.push({ path: LA_BAMBA_EX_PATH });
    if (versionRank >= rank.get('SN1')) withoutLaBamba.push({ path: LA_BAMBA_LH_PATH });
    data.songs = withoutLaBamba;
    await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`[song-overrides] migrated ${name}`);
}
