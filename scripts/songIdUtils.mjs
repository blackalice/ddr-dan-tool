import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  extractSongNumericId,
  formatSongIdNumber,
  normalizeSongIdValue,
} from '../src/utils/songId.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SONG_ID_MAP_PATH = path.join(__dirname, 'song-ids.json');

function normalizePathKey(p) {
  return String(p || '').replace(/\\/g, '/');
}

export async function loadSongIdMap() {
  try {
    const text = await fs.readFile(SONG_ID_MAP_PATH, 'utf-8');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const out = {};
      for (const [key, value] of Object.entries(parsed)) {
        const normalizedValue = normalizeSongIdValue(value);
        if (normalizedValue) {
          out[normalizePathKey(key)] = normalizedValue;
        }
      }
      return out;
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }
  return {};
}

export function ensureSongId(map, songPath) {
  const key = normalizePathKey(songPath);
  if (!key) return { id: null, created: false };
  if (map[key]) {
    const normalizedExisting = normalizeSongIdValue(map[key]);
    if (normalizedExisting) {
      if (normalizedExisting !== map[key]) {
        map[key] = normalizedExisting;
      }
      return { id: normalizedExisting, created: false };
    }
    return { id: null, created: false };
  }
  let max = 0;
  for (const value of Object.values(map)) {
    const numeric = extractSongNumericId(value);
    if (numeric > max) max = numeric;
  }
  const nextId = formatSongIdNumber(max + 1);
  map[key] = nextId;
  return { id: nextId, created: true };
}

export async function saveSongIdMap(map) {
  const sortedKeys = Object.keys(map).sort();
  const ordered = {};
  for (const key of sortedKeys) {
    ordered[key] = map[key];
  }
  await fs.writeFile(SONG_ID_MAP_PATH, `${JSON.stringify(ordered, null, 2)}\n`);
}
