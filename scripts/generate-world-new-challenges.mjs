import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildChartId } from '../src/utils/chartIds.js';

const csvPath = fileURLToPath(new URL('../ddr_world_new_difficulties.csv', import.meta.url));
const songMetaPath = fileURLToPath(new URL('../public/song-meta.json', import.meta.url));
const outputPath = fileURLToPath(new URL('../src/utils/worldNewChallengeChartsData.js', import.meta.url));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\r') {
      continue;
    }
    field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const normalizeString = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]/gu, '');

const levenshtein = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
};

const similarity = (a, b) => {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
};

const parseBpmRange = (value) => {
  const matches = String(value || '').match(/[\d.]+/g);
  if (!matches || matches.length === 0) return null;
  const nums = matches.map(num => Number.parseFloat(num)).filter(num => Number.isFinite(num));
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
};

const bpmBonus = (csvRange, song) => {
  if (!csvRange || song?.bpmMin == null || song?.bpmMax == null) return 0;
  const songMin = Number(song.bpmMin);
  const songMax = Number(song.bpmMax);
  if (!Number.isFinite(songMin) || !Number.isFinite(songMax)) return 0;
  const overlaps = csvRange.min <= songMax && csvRange.max >= songMin;
  if (overlaps) return 0.05;
  const delta = Math.min(
    Math.abs(csvRange.min - songMin),
    Math.abs(csvRange.max - songMax),
  );
  return delta <= 3 ? 0.03 : 0;
};

const normalizeMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'single' || normalized === 'sp' || normalized === 's') return 'single';
  if (normalized === 'double' || normalized === 'dp' || normalized === 'd') return 'double';
  return normalized;
};

const buildIndexes = (songs) => {
  const strict = new Map();
  const titleIndex = new Map();
  for (const song of songs) {
    const titles = new Set([
      normalizeString(song.title),
      normalizeString(song.titleTranslit),
    ]);
    const artists = new Set([
      normalizeString(song.artist),
      normalizeString(song.artistTranslit),
    ]);
    for (const titleKey of titles) {
      if (!titleKey) continue;
      const list = titleIndex.get(titleKey) || [];
      list.push(song);
      titleIndex.set(titleKey, list);
      for (const artistKey of artists) {
        if (!artistKey) continue;
        const key = `${titleKey}::${artistKey}`;
        if (!strict.has(key)) strict.set(key, song);
      }
    }
  }
  return { strict, titleIndex };
};

const pickBestMatch = ({ row, songs, indexes }) => {
  const titleRaw = row.Song || '';
  const artistRaw = row.Artist || '';
  const titleKey = normalizeString(titleRaw);
  const artistKey = normalizeString(artistRaw);
  if (titleKey && artistKey) {
    const strictKey = `${titleKey}::${artistKey}`;
    const strictMatch = indexes.strict.get(strictKey);
    if (strictMatch) return strictMatch;
  }

  let best = null;
  let bestScore = -1;
  const csvBpm = parseBpmRange(row.BPM);
  for (const song of songs) {
    const titleSim = Math.max(
      similarity(titleRaw, song.title || ''),
      similarity(titleRaw, song.titleTranslit || ''),
    );
    if (titleSim < 0.7) continue;
    const artistSim = artistKey
      ? Math.max(
        similarity(artistRaw, song.artist || ''),
        similarity(artistRaw, song.artistTranslit || ''),
      )
      : 0;
    const titleWeight = artistKey ? 0.7 : 1;
    const artistWeight = artistKey ? 0.3 : 0;
    const score = titleWeight * titleSim + artistWeight * artistSim + bpmBonus(csvBpm, song);
    if (score > bestScore) {
      bestScore = score;
      best = { song, titleSim, artistSim };
    }
  }
  if (!best) return null;
  const titleSimBest = best.titleSim;
  const artistSimBest = best.artistSim;
  const sameTitleCount = titleKey ? (indexes.titleIndex.get(titleKey)?.length || 0) : 0;
  const requireArtistStrong = artistKey && sameTitleCount > 1;

  if (!artistKey) {
    if (sameTitleCount > 1 && titleSimBest < 0.96) return null;
    return titleSimBest >= 0.92 ? best.song : null;
  }

  const pass = (
    titleSimBest >= 0.92 ||
    (titleSimBest >= 0.82 && artistSimBest >= 0.5) ||
    (requireArtistStrong && titleSimBest >= 0.80 && artistSimBest >= 0.65)
  );
  return pass ? best.song : null;
};

const run = async () => {
  const csvText = await readFile(csvPath, 'utf8');
  const csvRows = parseCsv(csvText);
  const headers = csvRows.shift()?.map(header => header.trim()) || [];
  const data = csvRows
    .filter(row => row.some(cell => String(cell || '').trim().length > 0))
    .map(row => Object.fromEntries(headers.map((key, idx) => [key, row[idx] || ''])));

  const songMeta = JSON.parse(await readFile(songMetaPath, 'utf8'));
  const songs = Array.isArray(songMeta) ? songMeta : [];
  const indexes = buildIndexes(songs);

  const chartIds = new Set();
  const unmatched = [];
  for (const row of data) {
    if (String(row.Difficulty || '').toLowerCase() !== 'challenge') continue;
    const mode = normalizeMode(row.Style || '');
    if (mode !== 'single' && mode !== 'double') continue;

    const song = pickBestMatch({ row, songs, indexes });
    if (!song) {
      unmatched.push(`${row.Song} | ${row.Artist} | ${row.Style}`);
      continue;
    }

    const chartId = buildChartId(song.id, mode, 'challenge');
    if (chartId) chartIds.add(chartId);
  }

  const sorted = Array.from(chartIds).sort();
  const lines = [
    '// Generated by scripts/generate-world-new-challenges.mjs. Do not edit.',
    'export const WORLD_NEW_CHALLENGE_CHART_IDS = [',
    ...sorted.map(id => `  "${id}",`),
    '];',
    '',
  ];
  await writeFile(outputPath, `${lines.join('\n')}`, 'utf8');

  console.log(`[world-new-challenges] charts=${sorted.length} unmatched=${unmatched.length}`);
  if (unmatched.length) {
    console.log('[world-new-challenges] unmatched rows:');
    for (const row of unmatched.slice(0, 20)) console.log(`- ${row}`);
    if (unmatched.length > 20) console.log(`... (${unmatched.length - 20} more)`);
  }
};

run().catch((err) => {
  console.error('[world-new-challenges] failed', err);
  process.exitCode = 1;
});
