import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { normalizeString } from '../src/utils/stringSimilarity.js';
import { collectStats, mergeStats, shouldSkipBuild, writeCache } from './cache-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const GENERATED_DIR = path.join(DATA_DIR, 'generated');
const REMYWIKI_DIR = path.join(DATA_DIR, 'remywiki', 'songlists');
const REMYWIKI_GAME_PAGE_DIR = path.join(DATA_DIR, 'remywiki', 'game-pages');
const OUTPUT_DIR = path.join(DATA_DIR, 'ddr-ver');
const SONG_META_PATH = path.join(GENERATED_DIR, 'song-meta.json');
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'ddr-version-overrides.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const RELEASES = [
  { id: 'DDR', label: 'DDR', file: 'DDR-full.json', snapshotFile: 'DDR.html', metaGames: ['DDR'] },
  { id: '2nd', label: '2nd', file: 'DDR2ND-full.json', snapshotFile: 'DDR2ND.html', metaGames: ['2nd'] },
  { id: '3rd', label: '3rd', file: 'DDR3RD-full.json', snapshotFile: 'DDR3RD.html', includeReleaseIds: ['2nd'], metaGames: ['3rd'] },
  { id: '4th', label: '4th', file: 'DDR4TH-full.json', snapshotFile: 'DDR4TH.html', metaGames: ['4th'] },
  { id: '4th Plus', label: '4th Plus', file: 'DDR4THPLUS-full.json', snapshotFile: 'DDR4THPLUS.html', metaGames: ['4th Plus'] },
  { id: '5th', label: '5th', file: 'DDR5TH-full.json', snapshotFile: 'DDR5TH.html', removalSnapshotFile: 'DDR5TH.html', metaGames: ['5th'] },
  { id: '6th', label: '6th', file: 'DDR6TH-full.json', snapshotFile: 'DDR6TH.html', metaGames: ['6th'] },
  { id: '7th', label: '7th', file: 'DDR7TH-full.json', snapshotFile: 'DDR7TH.html', removalSnapshotFile: 'DDR7TH.html', metaGames: ['7th'] },
  { id: 'EX', label: 'EX', file: 'DDREX-full.json', snapshotFile: 'DDREX.html', removalSnapshotFile: 'DDREX.html', metaGames: ['EX'] },
  { id: 'SN1', label: 'SN1', file: 'DDRSN1-full.json', snapshotFile: 'DDRSN1.html', removalSnapshotFile: 'DDRSN1.html', metaGames: ['SN1'] },
  { id: 'SN2', label: 'SN2', file: 'DDRSN2-full.json', snapshotFile: 'DDRSN2.html', removalSnapshotFile: 'DDRSN2.html', metaGames: ['SN2'] },
  { id: 'X', label: 'X', file: 'DDRX-full.json', snapshotFile: 'DDRX.html', removalSnapshotFile: 'DDRX.html', metaGames: ['X'] },
  { id: 'X2', label: 'X2', file: 'DDRX2-full.json', snapshotFile: 'DDRX2.html', removalSnapshotFile: 'DDRX2.html', metaGames: ['X2'] },
  { id: 'X3 vs 2nd', label: 'X3 vs 2nd', file: 'DDRX3VS2ND-full.json', snapshotFile: 'DDRX3VS2ND.html', removalSnapshotFile: 'DDRX3VS2ND.html', metaGames: ['X3 vs 2nd'] },
  { id: '2013', label: '2013', file: 'DDR2013-full.json', snapshotFile: 'DDR2013.html', removalSnapshotFile: 'DDR2013.html', metaGames: ['2013'] },
  { id: '2014', label: '2014', file: 'DDR2014-full.json', snapshotFile: 'DDR2014.html', removalSnapshotFile: 'DDR2014.html', metaGames: ['2014'] },
  { id: 'A', label: 'A', file: 'DDRA-full.json', snapshotFile: 'DDRA.html', removalSnapshotFile: 'DDRA.html', metaGames: ['A'] },
  { id: 'A20', label: 'A20', file: 'DDRA20-full.json', snapshotFile: 'DDRA20.html', removalSnapshotFile: 'DDRA20.html', metaGames: ['A20'] },
  { id: 'A20 Plus', label: 'A20 Plus', file: 'DDRA20PLUS-generated-full.json', snapshotFile: 'DDRA20PLUS.html', removalSnapshotFile: 'DDRA20PLUS.html', metaGames: ['A20 Plus'] },
  { id: 'A3', label: 'A3', file: 'DDRA3-generated-full.json', snapshotFile: 'DDRA3.html', removalSnapshotFile: 'DDRA3.html', metaGames: ['A3'] },
  { id: 'World', label: 'World', file: 'DDRWORLD-full.json', snapshotFile: 'DDRWORLD.html', removalSnapshotFile: 'DDRWORLD.html', metaGames: ['World'] },
];

const SNAPSHOT_EXTENSIONS = ['.html', '.htm'];
const SONG_LINK_BLOCKLIST = new Set([
  'song',
  'artist',
  'bpm',
  'single',
  'double',
  'beginner',
  'basic',
  'difficult',
  'expert',
  'challenge',
  'edit',
  'availability',
  'notes',
  'source',
]);
const REGIONAL_REMOVAL_RE = /\b(europe|european|north american|north america|korea|korean|asia|asian)\b/i;

function uniqueByTitle(entries) {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const title = typeof entry === 'string' ? entry : entry?.title;
    const key = normalizeString(title || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function listSnapshotFiles() {
  try {
    const entries = await fs.readdir(REMYWIKI_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && SNAPSHOT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(REMYWIKI_DIR, entry.name));
  } catch {
    return [];
  }
}

async function listRemovalSnapshotFiles() {
  try {
    const entries = await fs.readdir(REMYWIKI_GAME_PAGE_DIR, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && SNAPSHOT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase()))
      .map((entry) => path.join(REMYWIKI_GAME_PAGE_DIR, entry.name));
  } catch {
    return [];
  }
}

function snapshotMatchesRelease(file, release) {
  return path.basename(file) === release.snapshotFile;
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSnapshot(html) {
  const $ = load(html);
  const candidates = [];

  $('table.wikitable').each((_, table) => {
    if ($(table).closest('#toc, .toc, nav').length) return;
    if ($(table).attr('id') === 'toc') return;
    const headers = $(table).find('tr').first().find('th').map((__, th) => normalizeString($(th).text())).get();
    const songIndex = headers.findIndex((header) => header === 'song' || header === 'songs');
    const artistIndex = headers.findIndex((header) => header === 'artist' || header === 'artists');
    const gameIndex = headers.findIndex((header) => header === 'game' || header === 'version');
    if (songIndex === -1 || (artistIndex === -1 && gameIndex === -1)) return;

    $(table).find('tr').each((__, row) => {
      const cells = $(row).find('td');
      const secondaryIndex = artistIndex === -1 ? gameIndex : artistIndex;
      if (cells.length <= Math.max(songIndex, secondaryIndex)) return;
      const firstLink = $(cells[songIndex]).find('a').first();
      const title = cleanTitle(firstLink.text() || $(cells[songIndex]).text());
      const artist = artistIndex === -1 ? '' : cleanTitle($(cells[artistIndex]).text());
      const key = normalizeString(title);
      if (!key || SONG_LINK_BLOCKLIST.has(key) || title.length > 120) return;
      candidates.push(artist ? { title, artist } : title);
    });
  });

  if (candidates.length > 0) return uniqueByTitle(candidates);

  $('li').each((_, li) => {
    if ($(li).closest('#toc, .toc, nav').length || $(li).attr('class')?.includes('toclevel')) return;
    const link = $(li).find('a').first();
    const href = link.attr('href') || '';
    if (!href || href.startsWith('#')) return;
    const title = cleanTitle(link.text());
    const key = normalizeString(title);
    if (!key || SONG_LINK_BLOCKLIST.has(key) || title.length > 120) return;
    candidates.push(title);
  });

  return uniqueByTitle(candidates);
}

function parseRemovedSongs(html) {
  const $ = load(html);
  const removedHeading = $('h1,h2').filter((_, heading) => /^Removed Songs$/i.test($(heading).text().trim())).first();
  if (!removedHeading.length) return [];

  const removed = [];
  let includeCurrentBlock = true;
  let current = removedHeading.parent().next();
  while (current.length) {
    if (current.find('h1,h2').length) break;
    const headingText = current.find('th[colspan]').first().text().trim();
    if (headingText) {
      includeCurrentBlock = !REGIONAL_REMOVAL_RE.test(headingText);
    }
    if (includeCurrentBlock && current.is('table')) {
      current.find('tr').each((_, row) => {
        const cells = $(row).find('td');
        if (!cells.length) return;
        const link = $(cells[0]).find('a').first();
        const title = cleanTitle(link.text() || $(cells[0]).text());
        const key = normalizeString(title);
        if (!key || SONG_LINK_BLOCKLIST.has(key) || title.length > 120) return;
        removed.push(title);
      });
    }
    current = current.next();
  }
  return uniqueByTitle(removed);
}

async function buildFromSnapshots(snapshotFiles, removalSnapshotFiles, fallback) {
  const byRelease = new Map();
  const issues = [];

  for (const release of RELEASES) {
    const files = snapshotFiles.filter((file) => snapshotMatchesRelease(file, release));
    if (!files.length) {
      const fallbackEntry = fallback.byRelease.get(release.id);
      byRelease.set(release.id, fallbackEntry || { source: [], songs: [] });
      issues.push({ type: 'fallback-source', release: release.id, message: 'No matching RemyWiki snapshot found for this release.' });
      continue;
    }
    const songs = [];
    for (const file of files) {
      const html = await fs.readFile(file, 'utf8');
      const parsed = parseSnapshot(html);
      songs.push(...parsed);
      if (parsed.length === 0) {
        issues.push({ type: 'empty-snapshot', release: release.id, file: path.relative(ROOT_DIR, file) });
      }
    }
    byRelease.set(release.id, {
      source: files.map((file) => path.relative(ROOT_DIR, file)),
      songs: uniqueByTitle(songs),
    });
  }

  for (const release of RELEASES) {
    if (!Array.isArray(release.includeReleaseIds) || release.includeReleaseIds.length === 0) continue;
    const entry = byRelease.get(release.id);
    if (!entry) continue;
    const included = release.includeReleaseIds.flatMap((id) => byRelease.get(id)?.songs || []);
    const includedSources = release.includeReleaseIds.flatMap((id) => byRelease.get(id)?.source || []);
    byRelease.set(release.id, {
      source: [...entry.source, ...includedSources],
      songs: uniqueByTitle([...included, ...entry.songs]),
    });
  }

  for (const release of RELEASES) {
    if (!release.removalSnapshotFile) continue;
    const entry = byRelease.get(release.id);
    if (!entry) continue;
    const removalFile = removalSnapshotFiles.find((file) => path.basename(file) === release.removalSnapshotFile);
    if (!removalFile) {
      issues.push({ type: 'missing-removal-snapshot', release: release.id, file: release.removalSnapshotFile });
      continue;
    }
    const removals = parseRemovedSongs(await fs.readFile(removalFile, 'utf8'));
    if (!removals.length) continue;
    const removalKeys = new Set(removals.map((song) => normalizeString(typeof song === 'string' ? song : song.title)));
    const before = entry.songs.length;
    byRelease.set(release.id, {
      source: [...entry.source, path.relative(ROOT_DIR, removalFile)],
      songs: entry.songs.filter((song) => !removalKeys.has(normalizeString(typeof song === 'string' ? song : song.title))),
    });
    issues.push({
      type: 'removed-songs-applied',
      release: release.id,
      source: path.relative(ROOT_DIR, removalFile),
      removedRequested: removals.length,
      removedMatched: before - byRelease.get(release.id).songs.length,
    });
  }

  return { byRelease, issues };
}

async function buildFromSongMeta() {
  const meta = await readJson(SONG_META_PATH, []);
  const titleByRelease = new Map(RELEASES.map((release) => [release.id, []]));
  const releaseByGame = new Map();
  for (const release of RELEASES) {
    for (const game of release.metaGames) releaseByGame.set(game, release.id);
  }

  for (const song of meta) {
    const releaseId = releaseByGame.get(song?.game);
    if (!releaseId) continue;
    titleByRelease.get(releaseId).push({
      title: song.title,
      artist: song.artist,
      difficulties: {
        single: (song.difficulties || [])
          .filter((diff) => diff.mode === 'single')
          .map((diff) => ({ name: diff.difficulty, level: diff.feet })),
        double: (song.difficulties || [])
          .filter((diff) => diff.mode === 'double')
          .map((diff) => ({ name: diff.difficulty, level: diff.feet })),
      },
    });
  }

  const byRelease = new Map();
  let cumulative = [];
  for (const release of RELEASES) {
    cumulative = uniqueByTitle([...cumulative, ...titleByRelease.get(release.id)]);
    byRelease.set(release.id, {
      source: 'data/generated/song-meta.json cumulative fallback',
      songs: cumulative,
    });
  }
  return {
    byRelease,
    issues: [{ type: 'fallback-source', message: 'No RemyWiki songlist snapshots were found; generated cumulative lists from local song metadata.' }],
  };
}

async function main() {
  const snapshotFiles = await listSnapshotFiles();
  const removalSnapshotFiles = await listRemovalSnapshotFiles();
  const inputFiles = snapshotFiles.length ? [...snapshotFiles, ...removalSnapshotFiles] : [SONG_META_PATH];
  const inputStats = mergeStats(await collectStats(inputFiles, ROOT_DIR));
  const outputPaths = RELEASES.map((release) => path.join(OUTPUT_DIR, release.file));
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths,
    force: FORCE,
  });
  if (skip) {
    console.log(`[generate-ddr-version-overrides] up-to-date (${reason}) - skipping.`);
    return;
  }

  const fallback = await buildFromSongMeta();
  const built = snapshotFiles.length
    ? await buildFromSnapshots(snapshotFiles, removalSnapshotFiles, fallback)
    : fallback;

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  for (const release of RELEASES) {
    const entry = built.byRelease.get(release.id) || { source: [], songs: [] };
    const payload = {
      version: release.id,
      label: release.label,
      source: entry.source,
      generatedAt,
      songs: entry.songs,
      issues: built.issues.filter((issue) => !issue.release || issue.release === release.id),
    };
    await fs.writeFile(path.join(OUTPUT_DIR, release.file), JSON.stringify(payload, null, 2));
    console.log(`[generate-ddr-version-overrides] ${release.id}: ${payload.songs.length} songs -> data/ddr-ver/${release.file}`);
  }

  await writeCache(CACHE_PATH, inputStats);
}

main().catch((err) => {
  console.error('[generate-ddr-version-overrides] failed', err);
  process.exit(1);
});
