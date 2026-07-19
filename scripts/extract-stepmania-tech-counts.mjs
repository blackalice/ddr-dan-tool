import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { Worker } from 'worker_threads';
import { buildChartId } from '../src/utils/chartIds.js';
import {
  collectStats,
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
const WORKER_PATH = path.join(__dirname, 'extract-stepmania-tech-worker.mjs');
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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getWorkerCount(jobCount) {
  if (jobCount <= 0) return 0;
  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  const requested = Number.parseInt(process.env.DDR_STEPMANIA_WORKERS || '', 10);
  const configured = Number.isInteger(requested) && requested > 0
    ? requested
    : Math.min(8, available);
  return Math.max(1, Math.min(jobCount, configured));
}

function runWorkerPool(jobs) {
  if (jobs.length === 0) return Promise.resolve([]);

  const workerCount = getWorkerCount(jobs.length);
  return new Promise((resolve, reject) => {
    const workers = [];
    const results = new Array(jobs.length);
    let nextJob = 0;
    let completed = 0;
    let settled = false;

    const terminateWorkers = () => Promise.all(
      workers.map((worker) => worker.terminate()),
    );
    const fail = (err) => {
      if (settled) return;
      settled = true;
      terminateWorkers().finally(() => reject(err));
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      terminateWorkers().then(() => resolve(results), reject);
    };
    const assign = (worker) => {
      if (settled || nextJob >= jobs.length) return;
      worker.postMessage({ type: 'process', job: jobs[nextJob] });
      nextJob += 1;
    };

    for (let i = 0; i < workerCount; i += 1) {
      const worker = new Worker(WORKER_PATH);
      workers.push(worker);
      worker.on('message', (message) => {
        if (settled) return;
        if (message?.type !== 'result' || !Number.isInteger(message.index)) {
          fail(new Error('StepMania tech worker returned an invalid result.'));
          return;
        }
        results[message.index] = message;
        completed += 1;
        if (completed >= jobs.length) finish();
        else assign(worker);
      });
      worker.on('error', fail);
      worker.on('exit', (code) => {
        if (!settled && (code !== 0 || completed < jobs.length)) {
          fail(new Error(`StepMania tech worker exited with code ${code}.`));
        }
      });
      assign(worker);
    }
  });
}

async function main() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  const inputStats = mergeStats(
    // Rely on generate-sm-list cache rules for raw simfile change detection.
    await collectStats([SM_FILES_PATH, SONG_ID_MAP_PATH], ROOT_DIR),
    await collectStats(
      [
        path.join(ROOT_DIR, 'scripts', 'extract-stepmania-tech-counts.mjs'),
        path.join(ROOT_DIR, 'src', 'utils', 'smParser.js'),
        path.join(ROOT_DIR, 'src', 'utils', 'smParserUtils.js'),
        path.join(ROOT_DIR, 'src', 'utils', 'chartMetrics.js'),
        path.join(ROOT_DIR, 'scripts', 'itgmania-tech-counts.mjs'),
        path.join(ROOT_DIR, 'scripts', 'extract-stepmania-tech-worker.mjs'),
        path.join(ROOT_DIR, 'scripts', 'stepmania-tech-counts-utils.mjs'),
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

  const jobs = [];
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const songPath = normalizePathValue(files[fileIndex]?.path);
    if (!songPath) continue;

    const { id: songId, created } = ensureSongId(songIdMap, songPath);
    if (created) songIdMapChanged = true;
    jobs.push({
      index: jobs.length,
      songPath,
      songId,
      fullPath: toSimfilePath(songPath),
    });
  }

  const workerCount = getWorkerCount(jobs.length);
  if (workerCount > 0) {
    console.log(`[extract-stepmania-tech-counts] processing ${jobs.length} songs with ${workerCount} worker threads...`);
  }
  const results = await runWorkerPool(jobs);
  for (const result of results) {
    const { songPath } = result;
    if (result.error) {
      failedSongs += 1;
      console.warn(`[extract-stepmania-tech-counts] failed for ${songPath}: ${result.error}`);
      continue;
    }

    songCount += 1;
    for (const chart of result.chartEntries || []) {
      const counts = chart.counts;
      if (!counts) continue;

      const chartId = buildChartId(result.songId, chart.mode, chart.difficulty);
      const pmdKey = buildPathModeDifficultyKey(songPath, chart.mode, chart.difficulty);
      if (chartId) countsByChartId[chartId] = counts;
      if (pmdKey) countsByPathModeDifficulty[pmdKey] = counts;
      chartCount += 1;
    }

    if (songCount % 100 === 0) {
      console.log(`[extract-stepmania-tech-counts] processed ${songCount}/${files.length} songs...`);
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
