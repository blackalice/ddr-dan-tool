import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSm } from '../src/utils/smParser.js';
import { computeChartMetrics } from '../src/utils/chartMetrics.js';
import { buildChartId } from '../src/utils/chartIds.js';
import { computeItgmaniaTechCounts } from './itgmania-tech-counts.mjs';
import {
  collectStats,
  collectTreeStats,
  mergeStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs';
import { loadSongIdMap, ensureSongId, saveSongIdMap } from './songIdUtils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles');
const SM_FILES_PATH = path.join(GENERATED_DIR, 'sm-files.json');
const SONG_ID_MAP_PATH = path.join(DATA_DIR, 'song-ids.json');
const OUTPUT_PATH = path.join(GENERATED_DIR, 'stepmania-tech-counts.json');
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'extract-stepmania-tech-counts.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

function normalizePathValue(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function toSimfilePath(publicPath) {
  const normalized = normalizePathValue(publicPath);
  const trimmed = normalized.startsWith('sm/') ? normalized.slice(3) : normalized;
  return path.join(SIMFILES_DIR, trimmed);
}

function buildPathModeDifficultyKey(songPath, mode, difficulty) {
  const p = normalizePathValue(songPath);
  const m = String(mode || '').trim().toLowerCase();
  const d = String(difficulty || '').trim().toLowerCase();
  if (!p || !m || !d) return '';
  return `${p}|${m}|${d}`;
}

function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function putCount(target, key, value) {
  const n = toNonNegativeInt(value);
  if (n === null) return;
  target[key] = n;
}

function buildCounts(metrics, itgTech) {
  const debugStats = metrics?.debugStats && typeof metrics.debugStats === 'object'
    ? metrics.debugStats
    : {};
  const counts = {};

  // Basic counts
  putCount(counts, 'steps', metrics?.steps);
  putCount(counts, 'notes', metrics?.notes);
  putCount(counts, 'jumps', metrics?.jumps);
  putCount(counts, 'hands', metrics?.hands);
  putCount(counts, 'quads', metrics?.quads);
  putCount(counts, 'holds', metrics?.holds);
  putCount(counts, 'shocks', metrics?.shocks);

  // Footwork patterns
  putCount(counts, 'crossovers', debugStats.crossovers);
  putCount(counts, 'halfCrossovers', debugStats.halfCrossovers);
  putCount(counts, 'fullCrossovers', debugStats.fullCrossovers);
  putCount(counts, 'holdCrossovers', debugStats.holdCrossovers);
  putCount(counts, 'footswitches', debugStats.footswitches);
  putCount(counts, 'upFootswitches', debugStats.upFootswitches);
  putCount(counts, 'downFootswitches', debugStats.downFootswitches);
  putCount(counts, 'sideswitches', debugStats.sideswitches);
  putCount(counts, 'jacks', debugStats.jacks);
  putCount(counts, 'doublesteps', debugStats.doublesteps);
  putCount(counts, 'brackets', debugStats.brackets);
  putCount(counts, 'forcedBrackets', debugStats.forcedBrackets);

  // Advanced patterns
  putCount(counts, 'anchors', debugStats.anchors);
  putCount(counts, 'spins', debugStats.spins);
  putCount(counts, 'spins180', debugStats.spins180);
  putCount(counts, 'spins360', debugStats.spins360);
  putCount(counts, 'staircases', debugStats.staircases);
  putCount(counts, 'rolls', debugStats.rolls);
  putCount(counts, 'candles', debugStats.candles);
  putCount(counts, 'drills', debugStats.drills);
  putCount(counts, 'drillNotes', debugStats.drillNotes);
  putCount(counts, 'gallops', debugStats.gallops);
  putCount(counts, 'monoRuns', debugStats.monoRuns);
  putCount(counts, 'monoLeftRuns', debugStats.monoLeftRuns);
  putCount(counts, 'monoRightRuns', debugStats.monoRightRuns);
  putCount(counts, 'streams', debugStats.streamCount);
  putCount(counts, 'streamCount', debugStats.streamCount);
  putCount(counts, 'streamNotes', debugStats.streamNotes);
  putCount(counts, 'bursts', debugStats.bursts);
  putCount(counts, 'technicalMoves', debugStats.technicalMoves);

  // Prefer ITGmania StepParity/TechCounts for overlapping categories.
  if (itgTech && typeof itgTech === 'object') {
    putCount(counts, 'crossovers', itgTech.crossovers);
    putCount(counts, 'halfCrossovers', itgTech.halfCrossovers);
    putCount(counts, 'fullCrossovers', itgTech.fullCrossovers);
    putCount(counts, 'footswitches', itgTech.footswitches);
    putCount(counts, 'upFootswitches', itgTech.upFootswitches);
    putCount(counts, 'downFootswitches', itgTech.downFootswitches);
    putCount(counts, 'sideswitches', itgTech.sideswitches);
    putCount(counts, 'jacks', itgTech.jacks);
    putCount(counts, 'brackets', itgTech.brackets);
    putCount(counts, 'doublesteps', itgTech.doublesteps);
  }

  // ITGmania category aliases for compatibility.
  if (counts.crossovers != null) counts.TechCountsCategory_Crossovers = counts.crossovers;
  if (counts.footswitches != null) counts.TechCountsCategory_Footswitches = counts.footswitches;
  if (counts.sideswitches != null) counts.TechCountsCategory_Sideswitches = counts.sideswitches;
  if (counts.jacks != null) counts.TechCountsCategory_Jacks = counts.jacks;
  if (counts.brackets != null) counts.TechCountsCategory_Brackets = counts.brackets;
  if (counts.doublesteps != null) counts.TechCountsCategory_Doublesteps = counts.doublesteps;

  return Object.keys(counts).length > 0 ? counts : null;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  const inputStats = mergeStats(
    await collectStats([SM_FILES_PATH, SONG_ID_MAP_PATH], ROOT_DIR),
    await collectTreeStats(SIMFILES_DIR, (p) => /\.(sm|ssc)$/i.test(p), ROOT_DIR),
    await collectStats(
      [
        path.join(ROOT_DIR, 'src', 'utils', 'smParser.js'),
        path.join(ROOT_DIR, 'src', 'utils', 'chartMetrics.js'),
        path.join(ROOT_DIR, 'scripts', 'itgmania-tech-counts.mjs'),
      ],
      ROOT_DIR,
    ),
  );
  const config = { algorithm: 'itgmania-step-parity-v1+heuristic-v5', outputVersion: 3 };
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths: [OUTPUT_PATH],
    config,
    force: FORCE,
  });
  if (skip) {
    console.log(`[extract-stepmania-tech-counts] up-to-date (${reason}) - skipping.`);
    return;
  }

  const smList = await readJson(SM_FILES_PATH);
  const files = Array.isArray(smList?.files) ? smList.files : [];
  const songIdMap = await loadSongIdMap();
  let songIdMapChanged = false;

  const countsByChartId = {};
  const countsByPathModeDifficulty = {};
  let songCount = 0;
  let chartCount = 0;
  let failedSongs = 0;

  for (const file of files) {
    const songPath = normalizePathValue(file?.path);
    if (!songPath) continue;

    try {
      const { id: songId, created } = ensureSongId(songIdMap, songPath);
      if (created) songIdMapChanged = true;

      const fullPath = toSimfilePath(songPath);
      const source = await fs.readFile(fullPath, 'utf8');
      const parsed = parseSm(source);
      const availableTypes = Array.isArray(parsed?.availableTypes) ? parsed.availableTypes : [];
      const charts = parsed?.charts && typeof parsed.charts === 'object' ? parsed.charts : {};

      for (const chartType of availableTypes) {
        const mode = String(chartType?.mode || '').toLowerCase();
        const difficulty = String(chartType?.difficulty || '').toLowerCase();
        const slug = chartType?.slug;
        if (!slug || !mode || !difficulty) continue;
        const chart = charts[slug];
        if (!chart || typeof chart !== 'object') continue;

        const metrics = computeChartMetrics(chart);
        const itgTech = computeItgmaniaTechCounts(chart);
        const counts = buildCounts(metrics, itgTech);
        if (!counts) continue;

        const chartId = buildChartId(songId, mode, difficulty);
        const pmdKey = buildPathModeDifficultyKey(songPath, mode, difficulty);
        if (chartId) countsByChartId[chartId] = counts;
        if (pmdKey) countsByPathModeDifficulty[pmdKey] = counts;
        chartCount += 1;
      }

      songCount += 1;
      if (songCount % 100 === 0) {
        console.log(`[extract-stepmania-tech-counts] processed ${songCount}/${files.length} songs...`);
      }
    } catch (err) {
      failedSongs += 1;
      console.warn(`[extract-stepmania-tech-counts] failed for ${songPath}: ${err?.message || err}`);
    }
  }

  if (songIdMapChanged) {
    await saveSongIdMap(songIdMap);
  }

  const payload = {
    version: 3,
    generatedAt: new Date().toISOString(),
    source: 'itgmania-step-parity-v1+heuristic-v5',
    songCount,
    failedSongs,
    entryCount: chartCount,
    countsByChartId,
    countsByHash: {},
    countsByPathModeDifficulty,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await writeCache(CACHE_PATH, inputStats, config);
  console.log(`[extract-stepmania-tech-counts] wrote ${chartCount} chart entries from ${songCount} songs.`);
}

main().catch((err) => {
  console.error('Error extracting StepMania tech counts:', err);
  process.exit(1);
});
