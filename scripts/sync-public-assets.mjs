import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles');
const PUBLIC_SM_DIR = path.join(PUBLIC_DIR, 'sm');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');

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

  for (const file of filesToCopy) {
    if (await pathExists(file.from)) {
      await copyFile(file.from, file.to);
    } else {
      console.warn(`[sync-public-assets] missing file: ${file.from}`);
    }
  }

  const ddrVerRoot = path.join(DATA_DIR, 'ddr-ver');
  const ddrVerNested = path.join(ddrVerRoot, 'ddr-ver');
  const ddrVerSrc = (await pathExists(ddrVerNested)) ? ddrVerNested : ddrVerRoot;
  const ddrVerDest = path.join(PUBLIC_DIR, 'ddr-ver');
  await resetDir(ddrVerDest);
  await copyDirFiltered(ddrVerSrc, ddrVerDest, () => true);

  const allowedExt = new Set(['.sm', '.ssc', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
  await resetDir(PUBLIC_SM_DIR);
  await copyDirFiltered(SIMFILES_DIR, PUBLIC_SM_DIR, (src) => {
    const ext = path.extname(src).toLowerCase();
    return allowedExt.has(ext);
  });

  const logosSrc = path.join(ASSETS_DIR, 'logos');
  const logosDest = path.join(PUBLIC_DIR, 'img', 'logos');
  if (await pathExists(logosSrc)) {
    await resetDir(logosDest);
    await copyDirFiltered(logosSrc, logosDest, () => true);
  }

  console.log('[sync-public-assets] completed');
}

main().catch((err) => {
  console.error('[sync-public-assets] failed', err);
  process.exit(1);
});
