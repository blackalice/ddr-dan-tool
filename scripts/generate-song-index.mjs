#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(ROOT, 'data', 'generated', 'sm-files.json');
const outputPath = path.join(ROOT, 'data', 'generated', 'song-index.json');

const source = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const files = Array.isArray(source.files)
  ? source.files.map(({ id, path: songPath, title, titleTranslit, jacket }) => ({
      id,
      path: songPath,
      title,
      titleTranslit,
      jacket: jacket || null,
    }))
  : [];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify({
  games: Array.isArray(source.games) ? source.games : [],
  files,
}));
console.log(`Generated compact song index for ${files.length} songs.`);
