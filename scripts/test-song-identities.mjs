#!/usr/bin/env node
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { buildChartKey } from '../src/utils/chartIdentity.js';
import {
    buildSonglistOverrideLookup,
    songlistOverrideMatches,
} from '../src/utils/songlistOverrides.js';

const meta = JSON.parse(await fs.readFile('public/song-meta.json', 'utf8'));
const first = meta.find((song) => song.title === 'SUNKiSS♥DROP' && song.path.includes('Alison Side'));
const second = meta.find((song) => song.title === 'SUNKiSS♥DROP' && song.path.includes('jun Side'));
assert.ok(first && second, 'duplicate-title fixture is present');
assert.notEqual(first.path, second.path);
assert.notEqual(buildChartKey(first.path, 'single', 'expert'), buildChartKey(second.path, 'single', 'expert'));

const exact = buildSonglistOverrideLookup({
    version: 'SN2',
    songs: [{ path: first.path, difficulties: { single: ['expert'] } }],
}, meta);
assert.equal(songlistOverrideMatches(exact, { path: first.path, mode: 'single', difficulty: 'expert', game: 'SN2' }), true);
assert.equal(songlistOverrideMatches(exact, { path: first.path, mode: 'single', difficulty: 'basic', game: 'SN2' }), false);
assert.equal(songlistOverrideMatches(exact, { path: second.path, mode: 'single', difficulty: 'expert', game: 'SN2' }), false);

const legacy = buildSonglistOverrideLookup({ version: 'SN2', songs: ['SUNKiSS♥DROP'] }, meta);
assert.equal(songlistOverrideMatches(legacy, {
    title: first.title,
    artist: first.artist,
    path: first.path,
    mode: 'single',
    game: 'SN2',
}), false, 'ambiguous legacy title must fail closed');

console.log('[song-identities] tests passed');
