import { promises as fs } from 'fs';
import path from 'path';
import {
  collectStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs';

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const INPUT_PATH = process.env.DDR_STEPMANIA_TECH_INPUT || path.join(DATA_DIR, 'stepmania-tech-counts.json');
const OUTPUT_PATH = path.join(GENERATED_DIR, 'stepmania-tech-counts.json');
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'stepmania-tech-counts.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const DIFFICULTY_MAP = {
  beginner: 'beginner',
  easy: 'basic',
  basic: 'basic',
  trick: 'difficult',
  another: 'difficult',
  medium: 'difficult',
  difficult: 'expert',
  expert: 'expert',
  maniac: 'expert',
  ssr: 'expert',
  hard: 'expert',
  challenge: 'challenge',
  smaniac: 'challenge',
  edit: 'edit',
};

const toPosInt = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
};

const normalizePathValue = (value) => {
  if (!value) return '';
  return String(value).trim().replace(/\\/g, '/').replace(/^\/+/, '');
};

const normalizeMode = (value) => {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  if (raw === 'single' || raw === 'double') return raw;
  if (raw.startsWith('dance-')) {
    const mode = raw.replace('dance-', '');
    if (mode === 'single' || mode === 'double') return mode;
  }
  if (raw.includes('single')) return 'single';
  if (raw.includes('double')) return 'double';
  return raw;
};

const normalizeDifficulty = (value) => {
  if (!value) return '';
  const raw = String(value).trim().toLowerCase();
  return DIFFICULTY_MAP[raw] || raw;
};

const normalizeHash = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase();
};

function getFirstCount(sources, keys) {
  for (const src of sources) {
    if (!src || typeof src !== 'object') continue;
    for (const key of keys) {
      if (!(key in src)) continue;
      const n = toPosInt(src[key]);
      if (n !== null) return n;
    }
  }
  return null;
}

function normalizeCounts(entry) {
  const sources = [
    entry,
    entry?.techCounts,
    entry?.tech_counts,
    entry?.counts,
    entry?.metrics,
  ];

  const counts = {};
  const pick = (name, keys) => {
    const value = getFirstCount(sources, keys);
    if (value !== null) counts[name] = value;
  };

  pick('crossovers', ['crossovers', 'crossover', 'TechCountsCategory_Crossovers']);
  pick('footswitches', ['footswitches', 'footswitch', 'TechCountsCategory_Footswitches']);
  pick('sideswitches', ['sideswitches', 'sideswitch', 'TechCountsCategory_Sideswitches']);
  pick('jacks', ['jacks', 'jack', 'TechCountsCategory_Jacks']);
  pick('brackets', ['brackets', 'bracket', 'TechCountsCategory_Brackets']);
  pick('doublesteps', ['doublesteps', 'doublestep', 'TechCountsCategory_Doublesteps']);
  pick('halfCrossovers', ['halfCrossovers', 'half_crossovers']);
  pick('fullCrossovers', ['fullCrossovers', 'full_crossovers']);

  return Object.keys(counts).length > 0 ? counts : null;
}

function toEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.entries)) return raw.entries;
  if (Array.isArray(raw.charts)) return raw.charts;
  if (Array.isArray(raw.data)) return raw.data;

  const fromMap = (obj, withKeyField) => Object.entries(obj || {}).map(([k, v]) => ({
    ...(v && typeof v === 'object' ? v : {}),
    ...(withKeyField ? { [withKeyField]: k } : {}),
  }));

  if (raw.countsByChartId && typeof raw.countsByChartId === 'object') {
    return fromMap(raw.countsByChartId, 'chartId');
  }
  if (raw.byChartId && typeof raw.byChartId === 'object') {
    return fromMap(raw.byChartId, 'chartId');
  }
  if (raw.byHash && typeof raw.byHash === 'object') {
    return fromMap(raw.byHash, 'hash');
  }
  if (raw.countsByPathModeDifficulty && typeof raw.countsByPathModeDifficulty === 'object') {
    return Object.entries(raw.countsByPathModeDifficulty).map(([k, v]) => {
      const [p, m, d] = String(k).split('|');
      return {
        ...(v && typeof v === 'object' ? v : {}),
        path: p,
        mode: m,
        difficulty: d,
      };
    });
  }

  const vals = Object.values(raw);
  if (vals.length > 0 && vals.every((v) => v && typeof v === 'object')) {
    return Object.entries(raw).map(([k, v]) => ({ ...v, chartId: v?.chartId || k }));
  }

  return [];
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(text);
}

function buildPathModeDifficultyKey(pathValue, mode, difficulty) {
  if (!pathValue || !mode || !difficulty) return '';
  return `${normalizePathValue(pathValue)}|${normalizeMode(mode)}|${normalizeDifficulty(difficulty)}`;
}

async function main() {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  const inputExists = await pathExists(INPUT_PATH);
  const inputStats = await collectStats(inputExists ? [INPUT_PATH] : [], ROOT_DIR);
  const config = { inputExists, inputPath: normalizePathValue(path.relative(ROOT_DIR, INPUT_PATH)) };
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths: [OUTPUT_PATH],
    config,
    force: FORCE,
  });
  if (skip) {
    console.log(`[import-stepmania-tech-counts] up-to-date (${reason}) — skipping.`);
    return;
  }

  if (!inputExists) {
    const emptyPayload = {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourcePath: normalizePathValue(path.relative(ROOT_DIR, INPUT_PATH)),
      entryCount: 0,
      countsByChartId: {},
      countsByHash: {},
      countsByPathModeDifficulty: {},
    };
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(emptyPayload, null, 2));
    await writeCache(CACHE_PATH, inputStats, config);
    console.log('[import-stepmania-tech-counts] source file not found, wrote empty dataset.');
    return;
  }

  const raw = await readJson(INPUT_PATH);
  const entries = toEntries(raw);

  const countsByChartId = {};
  const countsByHash = {};
  const countsByPathModeDifficulty = {};
  let kept = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const counts = normalizeCounts(entry);
    if (!counts) continue;

    const chartId = String(entry.chartId || entry.chart_id || '').trim();
    const hash = normalizeHash(entry.hash || entry.chartHash || entry.gsHash || entry.hash16);
    const mode = normalizeMode(entry.mode || entry.playStyle || entry.stepsType || entry.style);
    const difficulty = normalizeDifficulty(entry.difficulty || entry.diff || entry.levelName || entry.level);
    const pathValue = normalizePathValue(
      entry.path || entry.simfilePath || entry.smPath || entry.filePath || entry.file || entry.songPath,
    );
    const pmdKey = buildPathModeDifficultyKey(pathValue, mode, difficulty);

    if (!chartId && !hash && !pmdKey) continue;
    kept += 1;

    if (chartId && !countsByChartId[chartId]) countsByChartId[chartId] = counts;
    if (hash && !countsByHash[hash]) countsByHash[hash] = counts;
    if (pmdKey && !countsByPathModeDifficulty[pmdKey]) countsByPathModeDifficulty[pmdKey] = counts;
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePath: normalizePathValue(path.relative(ROOT_DIR, INPUT_PATH)),
    entryCount: kept,
    countsByChartId,
    countsByHash,
    countsByPathModeDifficulty,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  await writeCache(CACHE_PATH, inputStats, config);
  console.log(`[import-stepmania-tech-counts] imported ${kept} entries.`);
}

main().catch((err) => {
  console.error('Error importing StepMania tech counts:', err);
  process.exit(1);
});

