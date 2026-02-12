import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  collectTreeStats,
  normalizePath,
  shouldSkipBuild,
  writeCache,
  walkFiles,
} from './cache-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles');
const CACHE_PATH = path.join(DATA_DIR, 'generated', '.cache', 'convert-jackets-webp.json');

const QUALITY = 60;
const WEBP_METHOD = 6;
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const JACKET_REGEX = /-jacket\.(png|jpg|jpeg|webp)$/i;

const isJacketAsset = (filePath) => JACKET_REGEX.test(filePath);

const toWebpPath = (sourcePath) => sourcePath.replace(/\.(png|jpg|jpeg|webp)$/i, '.webp');

const runMagick = (inputPath, outputPath) => {
  const args = [
    inputPath,
    '-strip',
    '-quality', String(QUALITY),
    '-define', `webp:method=${WEBP_METHOD}`,
    outputPath,
  ];
  const result = spawnSync('magick', args, { stdio: 'pipe' });
  if (result.status !== 0) {
    const stderr = (result.stderr || Buffer.from('')).toString('utf8').trim();
    const stdout = (result.stdout || Buffer.from('')).toString('utf8').trim();
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(details);
  }
};

const getMagickAvailability = () => {
  const probe = spawnSync('magick', ['-version'], { stdio: 'pipe' });
  if (probe.status === 0) {
    return { available: true, detail: '' };
  }
  const err = (probe.stderr || Buffer.from('')).toString('utf8').trim();
  return {
    available: false,
    detail: `ImageMagick "magick" command not available. Install ImageMagick and ensure it is on PATH. ${err}`.trim(),
  };
};

async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function main() {
  const jacketFiles = (await walkFiles(SIMFILES_DIR, (p) => isJacketAsset(p))).sort((a, b) => a.localeCompare(b));
  const expectedWebpOutputs = Array.from(new Set(jacketFiles.map(toWebpPath)));

  const inputStats = await collectTreeStats(SIMFILES_DIR, (p) => isJacketAsset(p), ROOT_DIR);
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths: expectedWebpOutputs,
    config: { quality: QUALITY, method: WEBP_METHOD },
    force: FORCE,
  });

  if (skip) {
    console.log(`[convert-jackets-webp] up-to-date (${reason}) — skipping.`);
    return;
  }

  const magick = getMagickAvailability();
  if (!magick.available) {
    const missingOutputs = [];
    for (const outputPath of expectedWebpOutputs) {
      const exists = await statOrNull(outputPath);
      if (!exists) missingOutputs.push(outputPath);
    }
    if (missingOutputs.length === 0) {
      console.warn('[convert-jackets-webp] magick unavailable; using existing WebP jackets.');
      return;
    }
    console.warn('[convert-jackets-webp] magick unavailable; skipping conversion and keeping legacy jacket formats.');
    console.warn(`[convert-jackets-webp] details: ${magick.detail}`);
    return;
  }

  let converted = 0;
  let skipped = 0;
  const failures = [];

  for (const sourcePath of jacketFiles) {
    const ext = path.extname(sourcePath).toLowerCase();
    const outputPath = toWebpPath(sourcePath);
    const sourceStat = await statOrNull(sourcePath);
    if (!sourceStat) {
      skipped += 1;
      continue;
    }

    if (!FORCE && ext !== '.webp') {
      const outStat = await statOrNull(outputPath);
      if (outStat && outStat.mtimeMs >= sourceStat.mtimeMs) {
        skipped += 1;
        continue;
      }
    }

    if (!FORCE && ext === '.webp') {
      skipped += 1;
      continue;
    }

    try {
      if (ext === '.webp') {
        const tempPath = `${sourcePath}.tmp-${process.pid}.webp`;
        runMagick(sourcePath, tempPath);
        await fs.rename(tempPath, sourcePath);
      } else {
        runMagick(sourcePath, outputPath);
      }
      converted += 1;
    } catch (err) {
      failures.push({
        source: normalizePath(path.relative(ROOT_DIR, sourcePath)),
        error: err?.message || String(err),
      });
    }
  }

  if (failures.length > 0) {
    console.error(`[convert-jackets-webp] failed for ${failures.length} file(s).`);
    for (const failure of failures.slice(0, 10)) {
      console.error(`  - ${failure.source}: ${failure.error}`);
    }
    if (failures.length > 10) {
      console.error(`  ...and ${failures.length - 10} more`);
    }
    process.exit(1);
  }

  const finalInputStats = await collectTreeStats(SIMFILES_DIR, (p) => isJacketAsset(p), ROOT_DIR);
  await writeCache(CACHE_PATH, finalInputStats, { quality: QUALITY, method: WEBP_METHOD });
  console.log(`[convert-jackets-webp] converted ${converted}, skipped ${skipped}.`);
}

main().catch((err) => {
  console.error('[convert-jackets-webp] failed', err);
  process.exit(1);
});
