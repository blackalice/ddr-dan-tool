import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const WORLD_PAGE_PATH = path.join(ROOT_DIR, 'DanceDanceRevolution WORLD - RemyWiki.html');
const OVERRIDE_DATA_PATH = path.join(ROOT_DIR, 'data', 'ddr-ver', 'DDRWORLD-EU-full.json');
const OVERRIDE_PUBLIC_PATH = path.join(ROOT_DIR, 'public', 'ddr-ver', 'DDRWORLD-EU-full.json');

const START_ID = 'FLARE_SKILL_RANK_unlocks';
const END_ID = 'BEMANI_PRO_LEAGUE_-SEASON_5-_Triple_Tribe';
const DEFAULT_CUTOFF_UTC = Date.UTC(2025, 8, 30); // September 30, 2025

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

const stripTags = (value) => decodeHtml(String(value || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const normalizeTitle = (value) => stripTags(value).normalize('NFKC').toLowerCase();
const hasLevel = (value) => {
  const v = stripTags(value);
  return v !== '' && v !== '-';
};

const parseDateToUtc = (value) => {
  const clean = String(value || '').replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  const parsed = Date.parse(clean);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

const extractUnlockRowsInRange = (html) => {
  const lines = html.split(/\r?\n/);
  const rows = [];

  let inRange = false;
  let sawEndHeading = false;
  let rowBuffer = null;
  let sectionId = '';

  for (const line of lines) {
    const h2Match = line.match(/<h2>.*?<span class="mw-headline" id="([^"]+)">/i);
    if (h2Match) {
      const headingId = h2Match[1];
      if (!inRange && headingId === START_ID) {
        inRange = true;
      } else if (inRange && headingId === END_ID) {
        sawEndHeading = true;
      } else if (inRange && sawEndHeading && headingId !== END_ID) {
        inRange = false;
      }
      if (inRange) sectionId = headingId;
    }

    if (!inRange) continue;

    if (rowBuffer === null) {
      if (line.includes('<tr')) rowBuffer = line;
      continue;
    }

    rowBuffer += `\n${line}`;
    if (!line.includes('</tr>')) continue;
    rows.push({ sectionId, rowHtml: rowBuffer });
    rowBuffer = null;
  }

  return rows;
};

const buildUnlockMap = (rows) => {
  const unlockByTitle = new Map();
  let subgroupDefaultAllowed = false;

  for (const row of rows) {
    const currentRow = row.rowHtml;
    const thCells = [...currentRow.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/gi)].map((match) => match[1]);
    if (thCells.length > 0) {
      const headingText = thCells.map(stripTags).join(' ');
      const defaultMatch = headingText.match(/available by default from ([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4})/i);
      if (defaultMatch) {
        const utc = parseDateToUtc(defaultMatch[1]);
        subgroupDefaultAllowed = utc !== null && utc <= DEFAULT_CUTOFF_UTC;
      } else if (/Added on/i.test(headingText)) {
        subgroupDefaultAllowed = false;
      }
    }

    const cells = [...currentRow.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 12) continue;

    const songCell = cells[0];
    const anchorMatch = songCell.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;

    const title = stripTags(anchorMatch[1]);
    const titleKey = normalizeTitle(anchorMatch[1]);
    if (!title || !titleKey) continue;

    const diffCells = cells.slice(3, 12);
    const nonChallengeIndexes = [0, 1, 2, 3, 5, 6, 7];
    const challengeIndexes = [4, 8];

    const hasNonChallengeUnlock = nonChallengeIndexes.some((index) => hasLevel(diffCells[index]));
    const hasChallengeUnlock = challengeIndexes.some((index) => hasLevel(diffCells[index]));
    const isChallengeOnlyUnlock = !hasNonChallengeUnlock && hasChallengeUnlock;

    const existing = unlockByTitle.get(titleKey) || {
      title,
      hasNonChallengeUnlock: false,
      hasChallengeOnlyUnlock: false,
      defaultAllowedByDate: false,
      sections: new Set(),
    };
    existing.hasNonChallengeUnlock = existing.hasNonChallengeUnlock || hasNonChallengeUnlock;
    existing.hasChallengeOnlyUnlock = existing.hasChallengeOnlyUnlock || isChallengeOnlyUnlock;
    existing.defaultAllowedByDate = existing.defaultAllowedByDate || subgroupDefaultAllowed;
    existing.sections.add(row.sectionId);
    unlockByTitle.set(titleKey, existing);
  }

  for (const value of unlockByTitle.values()) {
    value.sections = [...value.sections];
  }

  return unlockByTitle;
};

async function main() {
  const [worldHtml, overrideRaw] = await Promise.all([
    fs.readFile(WORLD_PAGE_PATH, 'utf-8'),
    fs.readFile(OVERRIDE_DATA_PATH, 'utf-8'),
  ]);

  const override = JSON.parse(overrideRaw);
  const songs = Array.isArray(override.songs) ? override.songs : [];

  const rowsInRange = extractUnlockRowsInRange(worldHtml);
  const unlockMap = buildUnlockMap(rowsInRange);

  const removableUnlocks = new Set(
    [...unlockMap.entries()]
      .filter(([, value]) => value.hasNonChallengeUnlock && !value.defaultAllowedByDate)
      .map(([key]) => key),
  );
  const keptByDefaultDate = [...unlockMap.values()]
    .filter((value) => value.hasNonChallengeUnlock && value.defaultAllowedByDate)
    .map((value) => value.title);
  const challengeOnlyUnlocks = [...unlockMap.values()]
    .filter((value) => value.hasChallengeOnlyUnlock && !value.hasNonChallengeUnlock)
    .map((value) => value.title);

  const removedSongs = [];
  const keptSongs = [];
  const filteredSongs = [];

  for (const song of songs) {
    const key = normalizeTitle(song);
    if (removableUnlocks.has(key)) {
      removedSongs.push(song);
      continue;
    }
    keptSongs.push(song);
    filteredSongs.push(song);
  }

  const unlockablesNotInOverride = [...unlockMap.values()]
    .filter((value) => value.hasNonChallengeUnlock)
    .map((value) => value.title)
    .filter((title) => !songs.some((song) => normalizeTitle(song) === normalizeTitle(title)));

  const updated = {
    ...override,
    generatedAt: new Date().toISOString(),
    unlockableFilterSource: path.basename(WORLD_PAGE_PATH),
    unlockableFilterRange: `${START_ID}..${END_ID}`,
    unlockableRowsParsed: rowsInRange.length,
    unlockableSongsParsed: unlockMap.size,
    unlockableSongsRemoved: removedSongs.length,
    unlockableSongsKeptByDefaultDate: keptByDefaultDate.length,
    songs: filteredSongs,
  };

  await fs.writeFile(OVERRIDE_DATA_PATH, JSON.stringify(updated, null, 2));
  await fs.writeFile(OVERRIDE_PUBLIC_PATH, JSON.stringify(updated, null, 2));

  console.log(`Updated ${OVERRIDE_DATA_PATH}`);
  console.log(`Updated ${OVERRIDE_PUBLIC_PATH}`);
  console.log(`Rows parsed in unlockable range: ${rowsInRange.length}`);
  console.log(`Unlockable songs parsed: ${unlockMap.size}`);
  console.log(`Unlockable songs kept by default-date rule (<= 2025-09-30): ${keptByDefaultDate.length}`);
  console.log(`Challenge-only unlock songs kept: ${challengeOnlyUnlocks.length}`);
  console.log(`Unlockable songs removed from override: ${removedSongs.length}`);
  console.log(`Final override songs: ${filteredSongs.length}`);

  if (removedSongs.length) {
    console.log('Removed songs:');
    removedSongs.sort((a, b) => a.localeCompare(b, 'en')).forEach((title) => console.log(`- ${title}`));
  }
  if (unlockablesNotInOverride.length) {
    console.log(`Unlockable songs not present in current override: ${unlockablesNotInOverride.length}`);
    unlockablesNotInOverride.sort((a, b) => a.localeCompare(b, 'en')).forEach((title) => console.log(`- ${title}`));
  }
  if (keptByDefaultDate.length) {
    console.log(`Unlockable songs kept due to default-date rule: ${keptByDefaultDate.length}`);
    keptByDefaultDate.sort((a, b) => a.localeCompare(b, 'en')).forEach((title) => console.log(`- ${title}`));
  }
  if (challengeOnlyUnlocks.length) {
    console.log(`Challenge-only unlock songs intentionally kept: ${challengeOnlyUnlocks.length}`);
    challengeOnlyUnlocks.sort((a, b) => a.localeCompare(b, 'en')).forEach((title) => console.log(`- ${title}`));
  }
}

main().catch((err) => {
  console.error('[filter-ddr-world-eu-unlockables] failed', err);
  process.exit(1);
});
