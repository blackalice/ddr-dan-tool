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
const COMBINED_RATINGS_PATH = path.join(PUBLIC_DIR, 'combined_song_ratings.json');

async function readJson(p) {
  const data = await fs.readFile(p, 'utf-8');
  return JSON.parse(data);
}

async function readSmFile(p) {
  const text = await fs.readFile(p, 'utf-8');
  return parseSm(text);
}

function normalizeName(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

function buildRatingMap(data, key) {
  const map = new Map();
  for (const entry of data) {
    const norm = normalizeName(entry.song_name);
    if (!map.has(norm)) map.set(norm, []);
    const val = entry[key];
    if (Array.isArray(val)) {
      map.get(norm).push(...val.map(Number));
    } else if (val !== undefined) {
      map.get(norm).push(Number(val));
    }
  }
  return map;
}

const ratingCache = new Map();

function getRatingsForTitle(title, map) {
  const norm = normalizeName(title);
  if (ratingCache.has(norm)) return [...ratingCache.get(norm)];
  if (map.has(norm)) {
    const arr = map.get(norm);
    ratingCache.set(norm, arr);
    return [...arr];
  }
  let bestKey = null;
  let bestDist = Infinity;
  for (const key of map.keys()) {
    const dist = levenshtein(norm, key);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = key;
    }
  }
  if (bestKey && bestDist <= 2) {
    const arr = map.get(bestKey);
    ratingCache.set(norm, arr);
    return [...arr];
  }
  ratingCache.set(norm, []);
  return [];
}

function pickRatingForLevel(ratings, level) {
  const idx = ratings.findIndex((r) => Math.floor(r) === level);
  if (idx !== -1) {
    const val = ratings[idx];
    ratings.splice(idx, 1);
    return val;
  }
  return ratings.shift();
}

const DIFF_ORDER = ['beginner','basic','difficult','expert','challenge','edit'];

async function main() {
  try {
    const smList = await readJson(SM_FILES_PATH);
    const combinedRatings = await readJson(COMBINED_RATINGS_PATH).catch(() => []);
    const singleRankMap = buildRatingMap(combinedRatings, 'single_rankings');
    const doubleRankMap = buildRatingMap(combinedRatings, 'doubles_rankings');
    const results = [];
    for (const file of smList.files) {
      try {
        const fullPath = path.join(PUBLIC_DIR, file.path);
        const simfile = await readSmFile(fullPath);
        const allBpms = Object.values(simfile.charts).flatMap(c => c.bpm.map(b => b.bpm)).filter(b => b > 0);
        const uniqueBpms = [...new Set(allBpms)];
        const bpmMin = uniqueBpms.length ? Math.min(...uniqueBpms) : 0;
        const bpmMax = uniqueBpms.length ? Math.max(...uniqueBpms) : 0;
        const singleRatings = getRatingsForTitle(simfile.title, singleRankMap);
        const doubleRatings = getRatingsForTitle(simfile.title, doubleRankMap);
        const ratingsByMode = { single: singleRatings, double: doubleRatings };

        const difficulties = simfile.availableTypes
          .sort((a,b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty))
          .map(c => {
            const arr = ratingsByMode[c.mode];
            const rating = pickRatingForLevel(arr, c.feet);
            return { mode: c.mode, difficulty: c.difficulty, feet: c.feet, rankedRating: rating };
          });
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
          jacket: file.jacket || null,
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

