import { promises as fs } from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const XML_PATH = path.join(ROOT_DIR, '__MUSICDB', 'musicdbA3.xml');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'ddr-ver', 'DDRA3-full.json');

const DIFFICULTY_NAMES = ['Beginner', 'Basic', 'Difficult', 'Expert', 'Challenge'];

const decodeXml = (value) => {
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

const readTag = (block, tag) => {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = block.match(re);
  return match ? decodeXml(match[1].trim()) : '';
};

const parseDiffs = (block) => {
  const match = block.match(/<diffLv[^>]*>([^<]+)<\/diffLv>/i);
  if (!match) return null;
  const values = match[1].trim().split(/\s+/).map((v) => Number(v));
  return values.length === 10 ? values : null;
};

const buildDifficultyList = (values, offset) => {
  const list = [];
  for (let i = 0; i < DIFFICULTY_NAMES.length; i += 1) {
    const level = Number(values[offset + i] || 0);
    if (!level) continue;
    list.push({ name: DIFFICULTY_NAMES[i], level });
  }
  return list;
};

const parseMusicdb = (xml) => {
  const blocks = xml.match(/<music>[\s\S]*?<\/music>/gi) || [];
  const songs = [];
  for (const block of blocks) {
    const title = readTag(block, 'title');
    const artist = readTag(block, 'artist');
    const diffs = parseDiffs(block);
    if (!title || !artist || !diffs) continue;
    songs.push({
      title,
      artist,
      difficulties: {
        single: buildDifficultyList(diffs, 0),
        double: buildDifficultyList(diffs, 5),
      },
    });
  }
  return songs;
};

async function main() {
  try {
    const xml = await fs.readFile(XML_PATH, 'utf-8');
    const songs = parseMusicdb(xml);
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    const payload = {
      version: 'A3',
      source: '__MUSICDB/musicdbA3.xml',
      generatedAt: new Date().toISOString(),
      songs,
    };
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2));
    console.log(`Generated ${OUTPUT_PATH} with ${songs.length} songs.`);
  } catch (err) {
    console.error('Failed to generate DDRA3-full.json:', err);
    process.exit(1);
  }
}

main();
