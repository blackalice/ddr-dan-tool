import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSm } from '../src/utils/smParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SM_FILES_PATH = path.join(PUBLIC_DIR, 'sm-files.json');
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'song-meta.json');

async function readJson(p) {
  const data = await fs.readFile(p, 'utf-8');
  return JSON.parse(data);
}

async function readSmFile(p) {
  const text = await fs.readFile(p, 'utf-8');
  return parseSm(text);
}

async function main() {
  try {
    const smList = await readJson(SM_FILES_PATH);
    const results = [];
    for (const file of smList.files) {
      try {
        const fullPath = path.join(PUBLIC_DIR, file.path);
        const simfile = await readSmFile(fullPath);
        const allBpms = Object.values(simfile.charts).flatMap(c => c.bpm.map(b => b.bpm)).filter(b => b > 0);
        const uniqueBpms = [...new Set(allBpms)];
        const bpmMin = uniqueBpms.length ? Math.min(...uniqueBpms) : 0;
        const bpmMax = uniqueBpms.length ? Math.max(...uniqueBpms) : 0;
        const difficulties = simfile.availableTypes.map(c => ({ mode: c.mode, difficulty: c.difficulty, feet: c.feet }));
        const game = file.path.split('/')[1] || 'Unknown';
        results.push({
          path: file.path,
          title: simfile.title,
          titleTranslit: simfile.titletranslit,
          artist: simfile.artist,
          game,
          bpmMin,
          bpmMax,
          hasMultipleBpms: uniqueBpms.length > 1,
          difficulties,
        });
      } catch (err) {
        console.warn('Failed to process', file.path, err.message);
      }
    }
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
    console.log(`Generated song metadata for ${results.length} songs.`);
  } catch (err) {
    console.error('Error generating song metadata:', err);
    process.exit(1);
  }
}

main();

