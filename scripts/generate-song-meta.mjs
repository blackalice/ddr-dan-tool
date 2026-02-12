import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSm } from '../src/utils/smParser.js';
import { loadSongIdMap, ensureSongId, saveSongIdMap } from './songIdUtils.mjs';
import { buildChartId } from '../src/utils/chartIds.js';
import {
  collectStats,
  mergeStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs';

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

function chartHasShock(chart) {
  if (!chart || !Array.isArray(chart.arrows)) return false;
  return chart.arrows.some((arrow) => {
    const dir = arrow.direction || '';
    if (!dir) return false;
    for (let i = 0; i < dir.length; i += 1) {
      if (dir[i] !== 'M') return false;
    }
    return true;
  });
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

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles');
const SM_FILES_PATH = path.join(GENERATED_DIR, 'sm-files.json');
const OUTPUT_PATH = path.join(GENERATED_DIR, 'song-meta.json');
const SONG_LENGTHS_PATH = path.join(GENERATED_DIR, 'song-lengths.json');
const COMBINED_RATINGS_PATH = path.join(DATA_DIR, 'rankings', 'combined_song_ratings.json');
const STEPMANIA_TECH_COUNTS_PATH = path.join(GENERATED_DIR, 'stepmania-tech-counts.json');
const SONG_ID_MAP_PATH = path.join(DATA_DIR, 'song-ids.json');
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'song-meta.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';
const MIN_REASONABLE_SONG_SECONDS = 10;
const MAX_REASONABLE_SONG_SECONDS = 60 * 60;

const toSimfilePath = (publicPath) => {
  const normalized = String(publicPath || '').replace(/\\/g, '/');
  const trimmed = normalized.startsWith('sm/') ? normalized.slice(3) : normalized;
  return path.join(SIMFILES_DIR, trimmed);
};

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

const ratingCache = new WeakMap();

function getRatingsForTitle(title, map) {
  const norm = normalizeName(title);
  let cacheForMap = ratingCache.get(map);
  if (!cacheForMap) {
    cacheForMap = new Map();
    ratingCache.set(map, cacheForMap);
  }
  if (cacheForMap.has(norm)) return [...cacheForMap.get(norm)];
  if (map.has(norm)) {
    const arr = map.get(norm);
    cacheForMap.set(norm, arr);
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
    cacheForMap.set(norm, arr);
    return [...arr];
  }
  cacheForMap.set(norm, []);
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

function normalizeTechCounts(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  const intKeys = [
    'steps',
    'notes',
    'jumps',
    'hands',
    'quads',
    'holds',
    'shocks',
    'stops',
    'crossovers',
    'footswitches',
    'sideswitches',
    'jacks',
    'brackets',
    'doublesteps',
    'halfCrossovers',
    'fullCrossovers',
    'holdCrossovers',
    'upFootswitches',
    'downFootswitches',
    'forcedBrackets',
    'anchors',
    'spins',
    'spins180',
    'spins360',
    'staircases',
    'rolls',
    'candles',
    'drills',
    'drillNotes',
    'gallops',
    'monoRuns',
    'monoLeftRuns',
    'monoRightRuns',
    'streams',
    'streamCount',
    'streamNotes',
    'bursts',
    'technicalMoves',
  ];
  const floatKeys = [
    'notesPerSecond',
    'stepsPerSecond',
    'maximumNotesPerSecond',
    'meanNotesPerSecond',
    'medianNotesPerSecond',
    'fastest3NoteBurst',
    'fastest7NoteRun',
    'fastest15NoteRun',
    'maxTimeBetweenNotes',
  ];
  for (const key of intKeys) {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = Math.round(n);
  }
  for (const key of floatKeys) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n) || n < 0) continue;
    const factor = 1000;
    out[key] = Math.round(n * factor) / factor;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function buildPathModeDifficultyKey(songPath, mode, difficulty) {
  const p = String(songPath || '').replace(/\\/g, '/').trim();
  const m = String(mode || '').toLowerCase().trim();
  const d = String(difficulty || '').toLowerCase().trim();
  if (!p || !m || !d) return '';
  return `${p}|${m}|${d}`;
}

function pickAudioDerivedLength(songLengths, songPath) {
  const entry = songLengths?.[songPath];
  if (!entry || typeof entry !== 'object') return null;
  const preferred = Number(entry.roundedSeconds);
  if (Number.isFinite(preferred) && preferred >= MIN_REASONABLE_SONG_SECONDS && preferred <= MAX_REASONABLE_SONG_SECONDS) {
    return preferred;
  }
  const secondary = Number(entry.seconds);
  if (Number.isFinite(secondary) && secondary >= MIN_REASONABLE_SONG_SECONDS && secondary <= MAX_REASONABLE_SONG_SECONDS) {
    return Math.round(secondary);
  }
  return null;
}

async function main() {
  try {
    await fs.mkdir(GENERATED_DIR, { recursive: true });
    const inputStats = mergeStats(
      await collectStats([SM_FILES_PATH, SONG_LENGTHS_PATH, COMBINED_RATINGS_PATH, STEPMANIA_TECH_COUNTS_PATH, SONG_ID_MAP_PATH], ROOT_DIR),
    );
    const { skip, reason } = await shouldSkipBuild({
      cachePath: CACHE_PATH,
      inputStats,
      outputPaths: [OUTPUT_PATH],
      force: FORCE,
    });
    if (skip) {
      console.log(`[generate-song-meta] up-to-date (${reason}) — skipping.`);
      return;
    }
    const smList = await readJson(SM_FILES_PATH);
    const songLengths = await readJson(SONG_LENGTHS_PATH).catch(() => ({}));
    const combinedRatings = await readJson(COMBINED_RATINGS_PATH).catch(() => []);
    const stepmaniaTechData = await readJson(STEPMANIA_TECH_COUNTS_PATH).catch(() => null);
    const stepmaniaByChartId = stepmaniaTechData?.countsByChartId && typeof stepmaniaTechData.countsByChartId === 'object'
      ? stepmaniaTechData.countsByChartId
      : {};
    const stepmaniaByPathModeDifficulty = stepmaniaTechData?.countsByPathModeDifficulty
      && typeof stepmaniaTechData.countsByPathModeDifficulty === 'object'
      ? stepmaniaTechData.countsByPathModeDifficulty
      : {};
    const singleRankMap = buildRatingMap(combinedRatings, 'single_rankings');
    const doubleRankMap = buildRatingMap(combinedRatings, 'doubles_rankings');
    const songIdMap = await loadSongIdMap();
    let mapChanged = false;
    const results = [];
    for (const file of smList.files) {
      try {
        const { id: songId, created } = ensureSongId(songIdMap, file.path);
        if (created) mapChanged = true;
        const fullPath = toSimfilePath(file.path);
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
            const chartId = buildChartId(songId, c.mode, c.difficulty);
            const chartData = simfile.charts[c.slug];
            const hasShock = chartHasShock(chartData);
            const pmdKey = buildPathModeDifficultyKey(file.path, c.mode, c.difficulty);
            const pmdKeyAlt = pmdKey.startsWith('sm/') ? pmdKey.slice(3) : `sm/${pmdKey}`;
            const stepmaniaTech = normalizeTechCounts(
              (chartId && stepmaniaByChartId[chartId])
              || stepmaniaByPathModeDifficulty[pmdKey]
              || stepmaniaByPathModeDifficulty[pmdKeyAlt]
              || null,
            );
            return {
              mode: c.mode,
              difficulty: c.difficulty,
              feet: c.feet,
              rankedRating: rating,
              chartId,
              hasShock,
              ...(stepmaniaTech ? { stepmaniaTech } : {}),
            };
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
        const computedLength = calculateSongLength(referenceChart.bpm, lastBeat, referenceChart.stops);
        const audioDerivedLength = pickAudioDerivedLength(songLengths, file.path);
        const length = audioDerivedLength ?? computedLength;

        results.push({
          id: songId,
          path: file.path,
          title: simfile.title,
          titleTranslit: simfile.titletranslit,
          artist: simfile.artist,
          artistTranslit: simfile.artisttranslit,
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
    if (mapChanged) {
      await saveSongIdMap(songIdMap);
    }
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2));
    console.log(`Generated song metadata for ${results.length} songs.`);
    await writeCache(CACHE_PATH, inputStats);
  } catch (err) {
    console.error('Error generating song metadata:', err);
    process.exit(1);
  }
}

main();
