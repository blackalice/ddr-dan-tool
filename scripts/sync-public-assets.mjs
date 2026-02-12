import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectStats,
  collectTreeStats,
  mergeStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'sync-public-assets.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles');
const PUBLIC_SM_DIR = path.join(PUBLIC_DIR, 'sm');

const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });
const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const copyFile = async (from, to) => {
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
};

const resetDir = async (dir) => {
  await fs.rm(dir, { recursive: true, force: true });
  await ensureDir(dir);
};

const copyDirFiltered = async (from, to, shouldCopy) => {
  if (!(await pathExists(from))) {
    console.warn(`[sync-public-assets] missing directory: ${from}`);
    return;
  }
  const entries = await fs.readdir(from, { withFileTypes: true });
  await ensureDir(to);
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDirFiltered(src, dest, shouldCopy);
      continue;
    }
    if (shouldCopy(src, entry.name)) {
      await fs.copyFile(src, dest);
    }
  }
};

async function main() {
  await ensureDir(PUBLIC_DIR);

  const isAllowedSimfileAsset = (src) => {
    const relative = path.relative(SIMFILES_DIR, src);
    const parts = relative.split(path.sep).filter(Boolean);
    const ext = path.extname(src).toLowerCase();
    if (ext === '.sm' || ext === '.ssc') {
      return true;
    }
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      if (/-jacket\.(png|jpg|jpeg|webp)$/i.test(src)) {
        return true;
      }
      // Allow one mix logo in the root of each mix folder:
      // data/simfiles/<Mix>/<Mix>.<ext>
      if (parts.length === 2) {
        const mixName = parts[0];
        const fileName = parts[1];
        const baseName = path.basename(fileName, ext);
        return baseName.toLowerCase() === mixName.toLowerCase();
      }
    }
    return false;
  };

  const filesToCopy = [
    { from: path.join(GENERATED_DIR, 'sm-files.json'), to: path.join(PUBLIC_DIR, 'sm-files.json') },
    { from: path.join(GENERATED_DIR, 'song-meta.json'), to: path.join(PUBLIC_DIR, 'song-meta.json') },
    { from: path.join(GENERATED_DIR, 'song-lengths.json'), to: path.join(PUBLIC_DIR, 'song-lengths.json') },
    { from: path.join(GENERATED_DIR, 'dan-data.json'), to: path.join(PUBLIC_DIR, 'dan-data.json') },
    { from: path.join(GENERATED_DIR, 'vega-data.json'), to: path.join(PUBLIC_DIR, 'vega-data.json') },
    { from: path.join(GENERATED_DIR, 'courses-data.json'), to: path.join(PUBLIC_DIR, 'courses-data.json') },
    { from: path.join(DATA_DIR, 'rankings', 'combined_song_ratings.json'), to: path.join(PUBLIC_DIR, 'combined_song_ratings.json') },
    { from: path.join(DATA_DIR, 'rankings', 'vega-results.json'), to: path.join(PUBLIC_DIR, 'vega-results.json') },
  ];

  const ddrVerRoot = path.join(DATA_DIR, 'ddr-ver');
  const ddrVerNested = path.join(ddrVerRoot, 'ddr-ver');
  const ddrVerSrc = (await pathExists(ddrVerNested)) ? ddrVerNested : ddrVerRoot;
  const ddrVerDest = path.join(PUBLIC_DIR, 'ddr-ver');

  const outputPaths = [
    ...filesToCopy.map(file => file.to),
    ddrVerDest,
    PUBLIC_SM_DIR,
  ];

  const inputStats = mergeStats(
    await collectStats(filesToCopy.map(file => file.from), ROOT_DIR),
    await collectTreeStats(ddrVerSrc, () => true, ROOT_DIR),
    await collectTreeStats(SIMFILES_DIR, isAllowedSimfileAsset, ROOT_DIR),
  );

  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths,
    config: { ddrVerSrc: path.relative(ROOT_DIR, ddrVerSrc) },
    force: FORCE,
  });
  if (skip) {
    console.log(`[sync-public-assets] up-to-date (${reason}) — skipping.`);
    return;
  }

  for (const file of filesToCopy) {
    if (await pathExists(file.from)) {
      await copyFile(file.from, file.to);
    } else {
      console.warn(`[sync-public-assets] missing file: ${file.from}`);
    }
  }

  await resetDir(ddrVerDest);
  await copyDirFiltered(ddrVerSrc, ddrVerDest, () => true);

  await resetDir(PUBLIC_SM_DIR);
  await copyDirFiltered(SIMFILES_DIR, PUBLIC_SM_DIR, isAllowedSimfileAsset);

  console.log('[sync-public-assets] completed');
  await writeCache(CACHE_PATH, inputStats, { ddrVerSrc: path.relative(ROOT_DIR, ddrVerSrc) });
}

main().catch((err) => {
  console.error('[sync-public-assets] failed', err);
  process.exit(1);
});
