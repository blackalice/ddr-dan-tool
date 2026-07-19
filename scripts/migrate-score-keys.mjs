#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChartId } from '../src/utils/chartIds.js';
import { buildChartKey } from '../src/utils/chartIdentity.js';
import { normalizeSongIdValue } from '../src/utils/songId.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
    if (!process.argv[i].startsWith('--')) continue;
    args.set(process.argv[i].slice(2), process.argv[i + 1]);
    i += 1;
}
const inputPath = args.get('scores');
const oldMapPath = args.get('old-map');
const outputPath = args.get('output') || path.resolve(process.cwd(), 'scores.migrated.json');
if (!inputPath || !oldMapPath) {
    console.error('Usage: node scripts/migrate-score-keys.mjs --scores scores.json --old-map song-ids.json [--output migrated.json]');
    process.exit(1);
}

const [scores, oldMap] = await Promise.all([
    fs.readFile(path.resolve(inputPath), 'utf8').then(JSON.parse),
    fs.readFile(path.resolve(oldMapPath), 'utf8').then(JSON.parse),
]);
const pathByOldId = new Map();
for (const [songPath, rawId] of Object.entries(oldMap || {})) {
    const id = normalizeSongIdValue(rawId);
    if (id) pathByOldId.set(id, songPath.replace(/\\/g, '/'));
}
const migrateMode = (source) => {
    const next = {};
    let migrated = 0;
    let unresolved = 0;
    for (const [key, value] of Object.entries(source || {})) {
        const parsed = parseChartId(key);
        if (!parsed) {
            next[key] = value;
            unresolved += 1;
            continue;
        }
        const songPath = pathByOldId.get(parsed.songId);
        const canonical = songPath && buildChartKey(songPath, parsed.mode, parsed.difficulty);
        if (!canonical) {
            next[key] = value;
            unresolved += 1;
            continue;
        }
        if (!next[canonical]) next[canonical] = value;
        migrated += 1;
    }
    return { next, migrated, unresolved };
};

const single = migrateMode(scores?.single || {});
const double = migrateMode(scores?.double || {});
await fs.writeFile(path.resolve(outputPath), `${JSON.stringify({ single: single.next, double: double.next }, null, 2)}\n`);
console.log(`[score-migration] wrote ${path.resolve(outputPath)}`);
console.log(`[score-migration] migrated ${single.migrated + double.migrated}; unresolved ${single.unresolved + double.unresolved}`);
