import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSm } from '../src/utils/smParser.js';

function getLastBeat(notes) {
  if (!notes) return 0;
  const measuresList = notes.split(',');
  let lastNoteMeasureIndex = -1;
  for (let j = measuresList.length - 1; j >= 0; j--) {
    if (/[1234MKLF]/i.test(measuresList[j])) {
      lastNoteMeasureIndex = j;
      break;
    }
  }
  if (lastNoteMeasureIndex !== -1) {
    const lastMeasureStr = measuresList[lastNoteMeasureIndex];
    const lines = lastMeasureStr.trim().split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return 0;
    let lastNoteLineIndex = -1;
    for (let k = lines.length - 1; k >= 0; k--) {
      if (/[1234MKLF]/i.test(lines[k])) {
        lastNoteLineIndex = k;
        break;
      }
    }
    if (lastNoteLineIndex !== -1) {
      const beatsInMeasure = 4;
      return (lastNoteMeasureIndex * beatsInMeasure) + (lastNoteLineIndex / lines.length) * beatsInMeasure;
    }
  }
  return 0;
}

function calculateSongLength(bpmChanges, songLastBeat, stops = []) {
  if (!bpmChanges || bpmChanges.length === 0) return 0;
  let time = 0;
  let lastBeat = bpmChanges[0].startOffset * 4;
  let currentBpm = bpmChanges[0].bpm;

  for (let i = 1; i < bpmChanges.length; i++) {
    const change = bpmChanges[i];
    const endBeat = change.startOffset * 4;
    const beatsElapsed = endBeat - lastBeat;
    if (currentBpm > 0) {
      time += (beatsElapsed / currentBpm) * 60;
    }
    stops.forEach(s => {
      const beat = s.offset * 4;
      if (beat >= lastBeat && beat < endBeat) {
        time += s.duration;
      }
    });
    currentBpm = change.bpm;
    lastBeat = endBeat;
  }

  const beatsRemaining = songLastBeat - lastBeat;
  if (currentBpm > 0 && beatsRemaining > 0) {
    time += (beatsRemaining / currentBpm) * 60;
  }
  stops.forEach(s => {
    const beat = s.offset * 4;
    if (beat >= lastBeat && beat < songLastBeat) {
      time += s.duration;
    }
  });
  return Math.round(time);
}

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

        const chartKeys = Object.keys(simfile.charts);
        let referenceChart = simfile.charts[chartKeys[0]];
        let lastBeat = getLastBeat(referenceChart.notes);
        for (const key of chartKeys) {
          const lb = getLastBeat(simfile.charts[key].notes);
          if (lb > lastBeat) {
            lastBeat = lb;
            referenceChart = simfile.charts[key];
          }
        }
        const length = calculateSongLength(referenceChart.bpm, lastBeat, referenceChart.stops);

        results.push({
          path: file.path,
          title: simfile.title,
          titleTranslit: simfile.titletranslit,
          artist: simfile.artist,
          game,
          bpmMin,
          bpmMax,
          hasMultipleBpms: bpmMax - bpmMin > 5,
          difficulties,
          length,
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

