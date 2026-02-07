import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectStats, mergeStats, shouldSkipBuild, writeCache } from './cache-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const HTML_PATH = path.join(ROOT_DIR, 'DanceDanceRevolution WORLD Full Song List - RemyWiki.html');
const REMOVALS_PATH = path.join(ROOT_DIR, 'DDR World EU Removals 06022026 Fixed.txt');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'ddr-ver', 'DDRWORLD-EU-full.json');
const CACHE_PATH = path.join(ROOT_DIR, 'data', 'generated', '.cache', 'ddr-world-eu-override.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const SECTION_RULES = new Map([
  ['DDRMAX 2', [/DDRMAX2/i]],
  ['DDR X', [/DanceDanceRevolution X \(/i]],
  ['DDR X2', [/DanceDanceRevolution X2/i]],
  ['DDR X3', [/DanceDanceRevolution X3/i]],
  ['DDR 2013', [/DanceDanceRevolution \(2013\)/i]],
  ['DDR 2014', [/DanceDanceRevolution \(2014\)/i]],
  ['DDR A', [/DanceDanceRevolution A \(/i]],
  ['DDR A20 / A20 PLUS', [/DanceDanceRevolution A20/i, /DanceDanceRevolution A20 PLUS/i]],
  ['DDR A3', [/DanceDanceRevolution A3/i]],
  ['DDR WORLD', [/Licenses/i, /KONAMI originals/i, /New Songs \(/i]],
]);

const decodeHtml = (value) => {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)));
};

const normalizeTitle = (value) => decodeHtml(String(value || ''))
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const parseRemovals = (text) => {
  const rows = text.split(/\r?\n/);
  const requests = [];
  let group = null;
  for (const raw of rows) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) {
      if (!group) continue;
      const title = line.slice(2).trim();
      requests.push({ group, title, key: normalizeTitle(title) });
      continue;
    }
    if (line.startsWith('(') || /^DDR World EU Song Removals$/i.test(line)) continue;
    group = line;
  }
  return requests;
};

const parseSongEntries = (html) => {
  const lines = html.split(/\r?\n/);
  const entries = [];
  let currentSection = '';

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const h2Match = line.match(/<h2>.*?<span class="mw-headline"[^>]*>(.*?)<\/span><\/h2>/i);
    if (h2Match) {
      currentSection = decodeHtml(h2Match[1]).replace(/<[^>]+>/g, '').trim();
      continue;
    }
    if (!line.includes('<li>')) continue;
    if (!line.includes(' / ')) continue;

    const songMatch = line.match(/<li>(?:<b>)?\s*<a\b[^>]*>(.*?)<\/a>/i);
    if (!songMatch) continue;
    const title = decodeHtml(songMatch[1]).replace(/<[^>]+>/g, '').trim();
    const key = normalizeTitle(title);
    if (!title || !key) continue;
    entries.push({
      lineIndex: i,
      section: currentSection,
      title,
      key,
    });
  }

  return { lines, entries };
};

const matchesSection = (entry, group) => {
  const rules = SECTION_RULES.get(group);
  if (!rules || rules.length === 0) return true;
  return rules.some((re) => re.test(entry.section));
};

async function main() {
  const inputStats = mergeStats(await collectStats([HTML_PATH, REMOVALS_PATH], ROOT_DIR));
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths: [OUTPUT_PATH],
    force: FORCE,
  });
  if (skip) {
    console.log(`[generate-ddr-world-eu-override] up-to-date (${reason}) - skipping.`);
    return;
  }

  const [html, removalsRaw] = await Promise.all([
    fs.readFile(HTML_PATH, 'utf-8'),
    fs.readFile(REMOVALS_PATH, 'utf-8'),
  ]);

  const removals = parseRemovals(removalsRaw);
  const { lines, entries } = parseSongEntries(html);
  const removeLineIndexes = new Set();
  const issues = [];

  for (const request of removals) {
    const byTitle = entries.filter((entry) => entry.key === request.key);
    const scoped = byTitle.filter((entry) => matchesSection(entry, request.group));

    if (scoped.length === 0) {
      if (byTitle.length === 0) {
        issues.push({ type: 'missing', group: request.group, title: request.title });
        continue;
      }
      byTitle.forEach((entry) => removeLineIndexes.add(entry.lineIndex));
      issues.push({
        type: 'section-mismatch',
        group: request.group,
        title: request.title,
        sections: [...new Set(byTitle.map((entry) => entry.section))],
      });
      continue;
    }

    if (scoped.length > 1) {
      issues.push({
        type: 'ambiguous',
        group: request.group,
        title: request.title,
        sections: [...new Set(scoped.map((entry) => entry.section))],
      });
    }

    scoped.forEach((entry) => removeLineIndexes.add(entry.lineIndex));
  }

  const remainingEntries = entries.filter((entry) => !removeLineIndexes.has(entry.lineIndex));
  const seen = new Set();
  const songs = [];
  for (const entry of remainingEntries) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    songs.push(entry.title);
  }

  const output = {
    version: 'WORLD-EU',
    source: path.basename(HTML_PATH),
    removalsSource: path.basename(REMOVALS_PATH),
    generatedAt: new Date().toISOString(),
    totalSourceSongs: entries.length,
    removedSongsRequested: removals.length,
    removedSongRows: removeLineIndexes.size,
    songs,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2));
  await writeCache(CACHE_PATH, inputStats);

  console.log(`Generated ${OUTPUT_PATH}`);
  console.log(`Source rows: ${entries.length}`);
  console.log(`Removal requests: ${removals.length}`);
  console.log(`Removed rows: ${removeLineIndexes.size}`);
  console.log(`Final unique songs: ${songs.length}`);

  if (issues.length === 0) {
    console.log('Issues: none');
    return;
  }

  const byType = (type) => issues.filter((issue) => issue.type === type);
  const missing = byType('missing');
  const mismatch = byType('section-mismatch');
  const ambiguous = byType('ambiguous');

  console.log(`Issues: ${issues.length} (missing=${missing.length}, section-mismatch=${mismatch.length}, ambiguous=${ambiguous.length})`);
  for (const issue of missing) {
    console.log(`ISSUE missing | ${issue.group} | ${issue.title}`);
  }
  for (const issue of mismatch) {
    console.log(`ISSUE section-mismatch | ${issue.group} | ${issue.title} | sections=${issue.sections.join(' || ')}`);
  }
  for (const issue of ambiguous) {
    console.log(`ISSUE ambiguous | ${issue.group} | ${issue.title} | sections=${issue.sections.join(' || ')}`);
  }
}

main().catch((err) => {
  console.error('[generate-ddr-world-eu-override] failed', err);
  process.exit(1);
});
