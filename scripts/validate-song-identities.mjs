#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChartKey, normalizeSongKey } from '../src/utils/chartIdentity.js';
import { normalizeString } from '../src/utils/stringSimilarity.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const generated = async (name) => {
    for (const candidate of [path.join(ROOT, 'data', 'generated', name), path.join(ROOT, 'public', name)]) {
        try { return await readJson(candidate); } catch { /* try next */ }
    }
    throw new Error(`Missing generated data: ${name}`);
};

const smFiles = await generated('sm-files.json');
const songMeta = await generated('song-meta.json');
const files = Array.isArray(smFiles?.files) ? smFiles.files : [];
const meta = Array.isArray(songMeta) ? songMeta : [];
const errors = [];
const fileByPath = new Map();
const metaByPath = new Map();
const chartKeys = new Set();

for (const file of files) {
    const key = normalizeSongKey(file?.path);
    if (!key) errors.push('sm-files entry is missing a path');
    if (fileByPath.has(key)) errors.push(`duplicate simfile path: ${key}`);
    fileByPath.set(key, file);
}
for (const song of meta) {
    const key = normalizeSongKey(song?.songKey || song?.path);
    if (!key) errors.push('song-meta entry is missing a songKey/path');
    if (metaByPath.has(key)) errors.push(`duplicate song metadata path: ${key}`);
    metaByPath.set(key, song);
    for (const diff of song?.difficulties || []) {
        const chartKey = diff?.chartKey || buildChartKey(key, diff?.mode, diff?.difficulty);
        if (!chartKey) errors.push(`invalid chart identity for ${key}`);
        if (chartKeys.has(chartKey)) errors.push(`duplicate chart key: ${chartKey}`);
        chartKeys.add(chartKey);
    }
}
for (const key of fileByPath.keys()) {
    if (!metaByPath.has(key)) errors.push(`simfile has no metadata: ${key}`);
}

const overrideDir = path.join(ROOT, 'data', 'ddr-ver');
const overrideFiles = (await fs.readdir(overrideDir)).filter((name) => name.endsWith('.json'));
for (const name of overrideFiles) {
    let data;
    try { data = await readJson(path.join(overrideDir, name)); }
    catch (error) {
        errors.push(`${name}: invalid JSON (${error.message})`);
        continue;
    }
    const entries = Array.isArray(data?.songs) ? data.songs : [];
    const overridePaths = new Set();
    for (const [index, entry] of entries.entries()) {
        const explicitPath = typeof entry === 'object' && entry
            ? entry.path || entry.songKey || entry.file || entry.songPath
            : null;
        if (explicitPath) {
            const key = normalizeSongKey(explicitPath);
            if (overridePaths.has(key)) errors.push(`${name}[${index}]: duplicate override path ${key}`);
            overridePaths.add(key);
            if (!fileByPath.has(key)) errors.push(`${name}[${index}]: missing simfile ${key}`);
            const song = metaByPath.get(key);
            for (const [mode, requested] of Object.entries(entry.difficulties || {})) {
                if (!Array.isArray(requested)) {
                    errors.push(`${name}[${index}]: ${mode} difficulties must be an array`);
                    continue;
                }
                const available = new Set((song?.difficulties || [])
                    .filter((diff) => diff.mode === mode)
                    .map((diff) => String(diff.difficulty).toLowerCase()));
                for (const item of requested) {
                    const difficulty = typeof item === 'string' ? item : item?.name || item?.difficulty;
                    if (!available.has(String(difficulty || '').toLowerCase())) {
                        errors.push(`${name}[${index}]: ${key} has no ${mode}/${difficulty}`);
                    }
                }
            }
            continue;
        }

        const title = typeof entry === 'string'
            ? entry
            : entry?.title || entry?.songTitle || entry?.name || entry?.song;
        const artist = typeof entry === 'object' && entry
            ? entry.artist || entry.songArtist || ''
            : '';
        const candidates = meta.filter((song) => {
            const titleMatch = [song.title, song.titleTranslit].filter(Boolean)
                .some((value) => normalizeString(value) === normalizeString(title));
            const artistMatch = !artist || [song.artist, song.artistTranslit].filter(Boolean)
                .some((value) => normalizeString(value) === normalizeString(artist));
            return titleMatch && artistMatch;
        });
        if (candidates.length !== 1) {
            errors.push(`${name}[${index}]: legacy entry ${JSON.stringify(title)} resolves to ${candidates.length} simfiles; migrate it to path identity`);
        }
    }
}

if (errors.length) {
    console.error(`[song-identities] ${errors.length} validation error(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(`[song-identities] validated ${fileByPath.size} simfiles, ${chartKeys.size} charts, and ${overrideFiles.length} override files`);
}
