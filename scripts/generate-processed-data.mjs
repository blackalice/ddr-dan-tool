import { promises as fs } from 'fs';
import path from 'path';
import Fraction from "fraction.js";
import { loadSongIdMap, ensureSongId, saveSongIdMap } from './songIdUtils.mjs';
import { buildChartId } from '../src/utils/chartIds.js';

// --- Start of smParserUtils.js content ---
const beats = [
  new Fraction(1).div(4),
  new Fraction(1).div(6),
  new Fraction(1).div(8),
  new Fraction(1).div(12),
  new Fraction(1).div(16),
];

function determineBeat(offset) {
  const match = beats.find((b) => offset.mod(b).n === 0);

  if (!match) {
    return 6;
  }

  return match.d;
}

const normalizedDifficultyMap = {
  beginner: "beginner",
  easy: "basic",
  basic: "basic",
  trick: "difficult",
  another: "difficult",
  medium: "difficult",
  difficult: "expert",
  expert: "expert",
  maniac: "expert",
  ssr: "expert",
  hard: "expert",
  challenge: "challenge",
  smaniac: "challenge",
  edit: "edit",
};

function similarBpm(a, b) {
  return Math.abs(a.bpm - b.bpm) < 1;
}

function mergeSimilarBpmRanges(bpm) {
  return bpm.reduce((building, b, i, a) => {
    const prev = a[i - 1];
    const next = a[i + 1];

    if (prev && similarBpm(prev, b)) {
      return building;
    }

    if (next && similarBpm(next, b)) {
      return building.concat({
        ...b,
        endOffset: next.endOffset,
      });
    }

    return building.concat(b);
  }, []);
}
// --- End of smParserUtils.js content ---

// --- Start of smParser.js content ---
const metaTagsToConsume = ["title", "titletranslit", "artist", "banner"];

function concludesANoteTag(line) {
  if (line === undefined) {
    return true;
  }
  return line.startsWith(";") || line.startsWith(",;");
}

function getMeasureLength(lines, i) {
  let measureLength = 0;
  for (
    ;
    i < lines.length && !concludesANoteTag(lines[i]) && !lines[i].startsWith(",");
    ++i
  ) {
    if (lines[i].trim() !== "") {
      measureLength += 1;
    }
  }
  return measureLength;
}

function trimNoteLine(line, mode) {
  return mode === "single" ? line.substring(0, 4) : line.substring(0, 8);
}

function isRest(line) {
  return line.split("").every((d) => d === "0");
}

function findFirstNonEmptyMeasure(mode, lines, i) {
  let numMeasuresSkipped = 0;
  let measureIndex = i;
  for (; i < lines.length && !concludesANoteTag(lines[i]); ++i) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.startsWith(",")) {
      measureIndex = i + 1;
      numMeasuresSkipped += 1;
      continue;
    }
    if (!isRest(trimNoteLine(line, mode))) {
      return { firstNonEmptyMeasureIndex: measureIndex, numMeasuresSkipped };
    }
  }
  return { firstNonEmptyMeasureIndex: -1, numMeasuresSkipped };
}

function parseStops(stopsString, emptyOffsetInMeasures) {
  if (!stopsString) return [];
  return stopsString.split(",").map((s) => {
    const [stopS, durationS] = s.split("=");
    return {
      offset: Number(stopS) * 0.25 - emptyOffsetInMeasures,
      duration: Number(durationS),
    };
  });
}

function parseBpms(bpmString, emptyOffsetInMeasures) {
  if (!bpmString) return [];
  const entries = bpmString.split(",");
  const bpms = entries.map((e, i, a) => {
    const [beatS, bpmS] = e.split("=");
    const nextBeatS = a[i + 1]?.split("=")[0] ?? null;
    return {
      startOffset: Number(beatS) * 0.25 - emptyOffsetInMeasures,
      endOffset:
        nextBeatS === null
          ? null
          : Number(nextBeatS) * 0.25 - emptyOffsetInMeasures,
      bpm: Number(bpmS),
    };
  });
  return mergeSimilarBpmRanges(bpms);
}

function parseFreezes(lines, i, mode, difficulty, title) {
  const freezes = [];
  const open = {};
  let curOffset = new Fraction(0);
  let curMeasureFraction = new Fraction(1).div(getMeasureLength(lines, i) || 1);

  for (; i < lines.length && !concludesANoteTag(lines[i]); ++i) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (line.startsWith(",")) {
      curMeasureFraction = new Fraction(1).div(
        getMeasureLength(lines, i + 1) || 1
      );
      continue;
    }
    if (!line.includes("2") && !line.includes("3")) {
      curOffset = curOffset.add(curMeasureFraction);
      continue;
    }
    const cleanedLine = line.replace(/[^23]/g, "0");
    for (let d = 0; d < cleanedLine.length; ++d) {
      if (cleanedLine[d] === "2") {
        if (open[d]) {
          throw new Error(
            `${title}, ${mode}, ${difficulty} -- error parsing freezes, found a new starting freeze before a previous one finished`
          );
        }
        open[d] = {
          direction: d,
          startOffset: Number(curOffset.n / curOffset.d),
        };
      } else if (cleanedLine[d] === "3") {
        if (!open[d]) {
          if (line[d] !== "2") {
            console.warn(
              `${title}, ${mode}, ${difficulty} -- error parsing freezes, needed to close a freeze that never opened. Line: ${line}`
            );
            continue;
          }
        }
        open[d].endOffset = Number(curOffset.n / curOffset.d) + 0.25;
          freezes.push(open[d]);
          open[d] = undefined;
        }
      }
    curOffset = curOffset.add(curMeasureFraction);
  }
  return freezes;
}

function parseSm(sm) {
  const sc = {
    charts: {},
    availableTypes: [],
    banner: null,
    title: "",
    titletranslit: "",
    artist: "",
    displayBpm: "N/A",
  };

  const getTagValue = (content, tagName) => {
    const regex = new RegExp(`#${tagName}:([^;]+);`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const parseChartNotes = (notesLines, mode, difficulty, title) => {
    const { firstNonEmptyMeasureIndex, numMeasuresSkipped } = findFirstNonEmptyMeasure(mode, notesLines, 0);
    if (firstNonEmptyMeasureIndex === -1) {
        return { arrows: [], freezes: [], numMeasuresSkipped: 0 };
    }

    const arrows = [];
    let curOffset = new Fraction(0);
    let curMeasureFraction = new Fraction(1).div(getMeasureLength(notesLines, firstNonEmptyMeasureIndex) || 1);

    for (let i = firstNonEmptyMeasureIndex; i < notesLines.length; ++i) {
        const line = trimNoteLine(notesLines[i], mode).replace(/3/g, "0");
        if (line.trim() === "") continue;
        if (line.startsWith(",")) {
            curMeasureFraction = new Fraction(1).div(getMeasureLength(notesLines, i + 1) || 1);
            continue;
        }
        if (!isRest(line)) {
            arrows.push({
                beat: determineBeat(new Fraction(curOffset)),
                offset: Number(curOffset.n / curOffset.d),
                direction: line,
            });
        }
        curOffset = curOffset.add(curMeasureFraction);
    }
    const freezes = parseFreezes(notesLines, firstNonEmptyMeasureIndex, mode, difficulty, sc.title);
    return { arrows, freezes, numMeasuresSkipped };
  };

  try {
    if (sm.includes('#NOTEDATA')) { // SSC Logic
      const header = sm.split('#NOTEDATA')[0];
      sc.title = getTagValue(header, 'TITLE');
      sc.titletranslit = getTagValue(header, 'TITLETRANSLIT');
      sc.artist = getTagValue(header, 'ARTIST');
      sc.banner = getTagValue(header, 'BANNER');
      const globalBpmString = getTagValue(header, 'BPMS');
      const globalStopsString = getTagValue(header, 'STOPS');

      const noteDataBlocks = sm.split(/#NOTEDATA:;/i);
      noteDataBlocks.shift();

      noteDataBlocks.forEach(block => {
        const stepstype = getTagValue(block, 'STEPSTYPE');
        if (!stepstype) return;
        const mode = stepstype.replace('dance-', '');
        if (mode !== 'single' && mode !== 'double') return;

        const difficultyRaw = getTagValue(block, 'DIFFICULTY');
        if (!difficultyRaw) return;
        const difficulty = normalizedDifficultyMap[difficultyRaw.toLowerCase()];
        if (!difficulty) return;

        const feet = Number(getTagValue(block, 'METER'));
        const chartBpmString = getTagValue(block, 'BPMS') || globalBpmString;
        const chartStopsString = getTagValue(block, 'STOPS') || globalStopsString;
        
        const notesMatch = block.match(/#NOTES:\s*([\s\S]*?);/i);
        const notesText = notesMatch ? notesMatch[1] : '';
        const notesLines = notesText.split('\n').map(l => l.trim());

        const { arrows, freezes, numMeasuresSkipped } = parseChartNotes(notesLines, mode, difficulty, sc.title);

        sc.charts[`${mode}-${difficulty}`] = {
            arrows,
            freezes,
            bpm: parseBpms(chartBpmString, numMeasuresSkipped),
            stops: parseStops(chartStopsString, numMeasuresSkipped),
            notes: notesText,
        };

        sc.availableTypes.push({
            slug: `${mode}-${difficulty}`,
            mode,
            difficulty: difficulty,
            feet,
        });
      });

    } else { // SM Logic
      const lines = sm.split('\n').map(l => l.trim());
      let i = 0;
      let bpmString = null;
      let stopsString = null;

      const parseNotesSm = (lines, i) => {
        i++;
        const mode = lines[i++].replace("dance-", "").replace(":", "");
        i++;
        const difficultyRaw = lines[i++].replace(":", "").toLowerCase();
        const difficulty = normalizedDifficultyMap[difficultyRaw];
        const feet = Number(lines[i++].replace(":", ""));
        i++;

        if (mode !== "single" && mode !== "double" || !difficulty) {
          let count = 0;
          for(let j = i; j < lines.length && !concludesANoteTag(lines[j]); j++) count++;
          return i + count + 1;
        }

        const notesLines = [];
        for (let j = i; j < lines.length && !concludesANoteTag(lines[j]); j++) {
            notesLines.push(lines[j]);
        }

        const { arrows, freezes, numMeasuresSkipped } = parseChartNotes(notesLines, mode, difficulty, sc.title);

        sc.charts[`${mode}-${difficulty}`] = {
            arrows,
            freezes,
            bpm: parseBpms(bpmString, numMeasuresSkipped),
            stops: parseStops(stopsString, numMeasuresSkipped),
            notes: notesLines.join('\n'),
        };

        sc.availableTypes.push({
            slug: `${mode}-${difficulty}`,
            mode,
            difficulty: difficulty,
            feet,
        });

        return i + notesLines.length + 1;
      }

      const parseTag = (lines, index) => {
        const line = lines[index];
        const r = /#([A-Za-z]+):([^;]*)/;
        const result = r.exec(line);

        if (result) {
          const tag = result[1].toLowerCase();
          const value = result[2];

          if (metaTagsToConsume.includes(tag)) {
            sc[tag] = value;
          } else if (tag === "bpms") {
            bpmString = value;
          } else if (tag === "stops") {
            stopsString = value;
          } else if (tag === "notes") {
            if (!bpmString) throw new Error("parseSm: about to parse notes but never got bpm");
            return parseNotesSm(lines, index);
          }
        }
        return index + 1;
      }

      while (i < lines.length) {
        const line = lines[i];
        if (!line.length || line.startsWith("//")) {
          i += 1;
          continue;
        }
        if (line.startsWith("#")) {
          i = parseTag(lines, i);
        } else {
          i += 1;
        }
      }
    }

    const allBpms = Object.values(sc.charts).flatMap(c => c.bpm.map(b => b.bpm));
    if (allBpms.length > 0) {
        const uniqueBpms = [...new Set(allBpms)];
        const minBpm = Math.min(...uniqueBpms);
        const maxBpm = Math.max(...uniqueBpms);
        sc.displayBpm = Math.abs(minBpm - maxBpm) < 2 ? Math.round(minBpm).toString() : `${Math.round(minBpm)}-${Math.round(maxBpm)}`;
    }

    return sc;

  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : "";
    throw new Error(`error, ${message}, ${stack}, parsing ${sm.substring(0, 300)}`);
  }
}
// --- End of smParser.js content ---

// --- Main build script logic ---

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const SM_FILES_PATH = path.join(PUBLIC_DIR, 'sm-files.json');
const COURSE_DATA_PATH = path.join(PUBLIC_DIR, 'course-data.json');
const DAN_OUTPUT_PATH = path.join(PUBLIC_DIR, 'dan-data.json');
const VEGA_OUTPUT_PATH = path.join(PUBLIC_DIR, 'vega-data.json');
const COMBINED_RATINGS_PATH = path.join(PUBLIC_DIR, 'combined_song_ratings.json');
// DDR Courses source (.crs files)
const DDR_COURSES_DIR = path.resolve(process.cwd(), 'cource', 'DDRCourses-master');
const COURSE_DATA_HTML = path.resolve(process.cwd(), 'cource', 'Course Data.html');
const COURSES_OUTPUT_PATH = path.join(PUBLIC_DIR, 'courses-data.json');


const readJson = async (filePath) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
};

const readSmFile = async (filePath) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseSm(content);
};

function normalizeName(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ß/g, 'ss')
        .replace(/[’‘`´]/g, "'")
        .replace(/＆/g, '&')
        .replace(/〜/g, '~')
        .replace(/–|—/g, '-')
        .replace(/[^a-z0-9]/g, '');
}

// remove tokens like (TYPE1) or (type3)
function stripTypeSuffix(name) {
    if (!name) return '';
    return name.replace(/\(\s*type\s*\d+\s*\)/ig, '').trim();
}

// remove tilded side markers like ~jun Side~ or ~Alison Side~
function stripSideSuffix(name) {
    if (!name) return '';
    return name.replace(/~\s*[^~]*\s*side\s*~/ig, '').trim();
}

function unicodeSimple(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[\p{P}\p{Z}\p{Cf}]/gu, '');
}

function levenshtein(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            );
        }
    }
    return dp[a.length][b.length];
}

function buildRatingMap(data, key) {
    const map = new Map();
    for (const entry of data) {
        const norm = normalizeName(entry.song_name);
        if (!map.has(norm)) map.set(norm, []);
        const val = entry[key];
        if (Array.isArray(val)) {
            map.get(norm).push(...val.map(Number));
        } else if (val !== undefined) {
            map.get(norm).push(Number(val));
        }
    }
    return map;
}

const ratingCache = new Map();

function getRatingsForTitle(title, map) {
    const norm = normalizeName(title);
    if (ratingCache.has(norm)) return [...ratingCache.get(norm)];
    if (map.has(norm)) {
        const arr = map.get(norm);
        ratingCache.set(norm, arr);
        return [...arr];
    }
    let bestKey = null;
    let bestDist = Infinity;
    for (const key of map.keys()) {
        const dist = levenshtein(norm, key);
        if (dist < bestDist) {
            bestDist = dist;
            bestKey = key;
        }
    }
    if (bestKey && bestDist <= 2) {
        const arr = map.get(bestKey);
        ratingCache.set(norm, arr);
        return [...arr];
    }
    ratingCache.set(norm, []);
    return [];
}

function pickRatingForLevel(ratings, level) {
    const idx = ratings.findIndex(r => Math.floor(r) === level);
    if (idx !== -1) {
        const val = ratings[idx];
        ratings.splice(idx, 1);
        return val;
    }
    return ratings.shift();
}

function buildFileKeys(file) {
    const title = file.title || '';
    const translit = file.titleTranslit || '';
    const baseKeys = new Set();
    const pushAscii = (s) => { const n = normalizeName(s); if (n) baseKeys.add(n); };
    const pushUni = (s) => { const n = unicodeSimple(s); if (n) baseKeys.add(n); };
    // ASCII-like keys
    pushAscii(title); pushAscii(translit);
    pushAscii(stripTypeSuffix(title));
    pushAscii(stripTypeSuffix(translit));
    pushAscii(stripSideSuffix(title));
    pushAscii(stripSideSuffix(translit));
    // Unicode-simple keys
    pushUni(title); pushUni(translit);
    const keys = [...baseKeys];
    return keys;
}

// use the levenshtein() already defined above for ratings

function findSongFile(title, smFiles, gameHint = null) {
    const t0 = normalizeName(title);
    const t1 = normalizeName(stripTypeSuffix(title));
    const t2 = normalizeName(stripSideSuffix(title));
    const u0 = unicodeSimple(title);
    const titleKeys = new Set([t0, t1, t2, u0].filter(Boolean));

    let best = null;
    let bestScore = Infinity;

    for (const file of smFiles.files) {
        const fileKeys = buildFileKeys(file);
        // fast exact
        if (fileKeys.some(k => titleKeys.has(k))) {
            // prefer same game when hinted
            if (!gameHint) return file;
            const folderGame = (file.path.split('/')[1] || '').toLowerCase();
            if (folderGame === gameHint.toLowerCase()) return file;
            // otherwise keep as candidate but continue search for exact+hint
            if (!best || bestScore > 0) { best = file; bestScore = 0; }
            continue;
        }
        // fuzzy candidates
        for (const tk of titleKeys) {
            for (const fk of fileKeys) {
                const dist = levenshtein(tk, fk);
                const maxLen = Math.max(tk.length, fk.length);
                const threshold = maxLen <= 10 ? 2 : maxLen <= 20 ? 3 : 5;
                if (dist <= threshold) {
                    // prefer smaller distance, and prefer game match
                    let score = dist;
                    if (gameHint) {
                        const folderGame = (file.path.split('/')[1] || '').toLowerCase();
                        if (folderGame !== gameHint.toLowerCase()) score += 0.5;
                    }
                    if (score < bestScore) { best = file; bestScore = score; }
                }
                // containment boost (substring)
                if (tk.length > 6 && fk.includes(tk)) {
                    let score = Math.floor((fk.length - tk.length) / 5);
                    if (gameHint) {
                        const folderGame = (file.path.split('/')[1] || '').toLowerCase();
                        if (folderGame !== gameHint.toLowerCase()) score += 1;
                    }
                    if (score < bestScore) { best = file; bestScore = score; }
                }
            }
        }
    }
    return best;
}

const processCourseList = async (courses, smFiles, singleRankMap, doubleRankMap, songIdMapState, gameHint = null) => {
    if (!courses) return [];
    const processedCourses = [];

    for (const course of courses) {
        const processedSongs = [];
        for (const shortCode of course.charts) {
            const parts = shortCode.split(':');
            const mode = parts.pop();
            const difficulty = parts.pop();
            const title = parts.join(':');
            
            const songFile = findSongFile(title, smFiles, gameHint);
            if (!songFile) {
                console.warn(`Song not found for short code: ${shortCode}`);
                processedSongs.push({
                    title,
                    difficulty,
                    mode,
                    error: 'Song file not found',
                });
                continue;
            }

            const smFilePath = path.join(PUBLIC_DIR, songFile.path);
            const simfileData = await readSmFile(smFilePath);
            if (!simfileData) {
                processedSongs.push({
                    title,
                    difficulty,
                    mode,
                    error: 'Failed to load simfile',
                });
                continue;
            }

            const { id: ensuredId, created } = ensureSongId(songIdMapState.map, songFile.path);
            if (created) songIdMapState.changed = true;
            const songId = songFile.id || ensuredId;

            const chart = simfileData.availableTypes.find(c => c.difficulty === difficulty && c.mode === mode);
            if (!chart) {
                processedSongs.push({
                    title,
                    difficulty,
                    mode,
                    error: 'Chart not found in simfile',
                });
                continue;
            }

            const chartDetails = simfileData.charts[chart.slug];
            const bpms = chartDetails.bpm.map(b => b.bpm).filter(b => b > 0);
            const bpmDisplay = bpms.length === 1
                ? String(Math.round(bpms[0]))
                : `${Math.round(Math.min(...bpms))}-${Math.round(Math.max(...bpms))}`;

            const game = songFile.path.split('/')[1] || 'N/A';

            const ratingsSingle = getRatingsForTitle(simfileData.title, singleRankMap);
            const ratingsDouble = getRatingsForTitle(simfileData.title, doubleRankMap);
            const ratingArrByMode = { single: ratingsSingle, double: ratingsDouble };
            const rankedRating = pickRatingForLevel(ratingArrByMode[chart.mode], chart.feet);
            const chartId = buildChartId(songId, chart.mode, chart.difficulty);

            processedSongs.push({
                title: simfileData.title,
                level: chart.feet,
                bpm: bpmDisplay,
                difficulty: chart.difficulty,
                mode: chart.mode,
                game: game,
                rankedRating,
                songId,
                chartId,
                path: songFile.path,
                artist: simfileData.artist,
            });
        }
        const chartIds = processedSongs.map(s => s.chartId).filter(Boolean);
        processedCourses.push({ ...course, songs: processedSongs, chartIds });
    }
    return processedCourses;
};


// --- DDR Courses (.crs) parsing ---
function normalizeCrsDifficulty(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    // strip common punctuation
    const token = s.replace(/[^a-z0-9]/g, '');
    switch (token) {
        case 'beginner':
        case 'novice':
            return 'beginner';
        case 'easy':
        case 'basic':
        case 'light':
            return 'basic';
        case 'trick':
        case 'another':
        case 'medium':
        case 'standard':
        case 'normal':
            return 'difficult';
        case 'difficult':
        case 'expert':
        case 'heavy':
        case 'maniac':
        case 'hard':
        case 'ssr':
            return 'expert';
        case 'challenge':
        case 'oni':
        case 'smaniac':
            return 'challenge';
        case 'edit':
            return 'edit';
        default:
            return null;
    }
}

function parseCrsFileContent(text) {
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let name = null;
    let translit = null;
    let style = 'single';
    const songs = [];
    for (const line of lines) {
        if (line.startsWith('#COURSETRANSLIT:')) {
            translit = line.slice('#COURSETRANSLIT:'.length).replace(/;.*$/, '').trim();
        } else if (line.startsWith('#COURSE:')) {
            name = line.slice('#COURSE:'.length).replace(/;.*$/, '').trim();
        } else if (line.startsWith('#STYLE:')) {
            const s = line.slice('#STYLE:'.length).replace(/;.*$/, '').trim().toLowerCase();
            style = s === 'double' ? 'double' : 'single';
        } else if (line.startsWith('#SONG:')) {
            // Format variations: #SONG:Title:DIFF; or #SONG:Title:DIFF:;
            const body = line.slice('#SONG:'.length).replace(/;.*$/, '');
            const parts = body.split(':');
            // Difficulty is the last non-empty part
            let diff = null;
            let lastIdx = parts.length - 1;
            for (let i = parts.length - 1; i >= 0; i--) {
                const token = parts[i].trim();
                if (token) { diff = token; lastIdx = i; break; }
            }
            const difficulty = normalizeCrsDifficulty(diff);
            // Title is everything before the last non-empty part
            let title = parts.slice(0, Math.max(1, lastIdx)).join(':').trim();
            if (!title) continue;
            songs.push({ title, difficulty });
        }
    }
    const finalName = !name || /\?/.test(name) ? (translit || name || 'Untitled Course') : name;
    return { name: finalName, style, songs };
}

function mapCoursesGameToSm(gameKey) {
    const key = (gameKey || '').toLowerCase();
    if (key.includes('a20 plus') || key.includes('course mode a20 plus')) return 'A20 Plus';
    if (key.includes('a20')) return 'A20';
    if (key.includes(' a3')) return 'A3';
    if (key.endsWith('2014')) return '2014';
    if (key.endsWith('2013')) return '2013';
    if (key.includes('extreme')) return 'EX';
    if (key.includes('supernova 2')) return 'SN2';
    if (key.includes('supernova')) return 'SN1';
    if (key.match(/\bx3\b/) || key.includes('x3')) return 'X3 vs 2nd';
    if (key.match(/\bx2\b/)) return 'X2';
    if (key.match(/\bx\b/) || key.includes(' x ')) return 'X';
    if (key.includes('4th mix plus')) return '4th Plus';
    if (key.includes('4th mix')) return '4th';
    if (key.includes('3rd mix')) return '3rd';
    if (key.includes('2nd mix')) return '2nd';
    if (key.endsWith('dance dance revolution')) return 'DDR';
    return null;
}

async function collectCrsCourses(rootDir) {
    const out = new Map(); // gameName -> [ { name, charts, color?, style } ]
    async function readDirRecursive(dir, relGameName) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) {
                // At first level under DDRCourses-master, folder name is the game
                const game = relGameName || ent.name;
                await readDirRecursive(full, game);
            } else if (ent.isFile() && /\.crs$/i.test(ent.name)) {
                const text = await fs.readFile(full, 'utf-8');
                const parsed = parseCrsFileContent(text);
                if (!parsed || !parsed.songs || parsed.songs.length === 0) continue;
                const charts = parsed.songs.map(s => `${s.title}:${s.difficulty || 'expert'}:${parsed.style}`);
                const course = {
                    name: parsed.name,
                    charts,
                    style: parsed.style,
                    // consistent header color per style
                    color: parsed.style === 'double' ? '#9b59b6' : '#46aadc',
                };
                const gameKey = relGameName || path.basename(path.dirname(full));
                if (!out.has(gameKey)) out.set(gameKey, []);
                out.get(gameKey).push(course);
            }
        }
    }
    await readDirRecursive(rootDir, null);
    return out; // Map
}

function stripHtml(str) {
    return String(str || '')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

async function parseA3Html(htmlPath) {
    try {
        const html = await fs.readFile(htmlPath, 'utf-8');
        const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
        const courses = [];
        for (const m of rows) {
            const row = m[1];
            if (/colspan\s*=\s*4/i.test(row) || /<th/i.test(row)) continue; // header rows
            const tds = [...row.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
            if (tds.length < 5) continue;
            const name = stripHtml(tds[0]).toUpperCase();
            const songs = tds.slice(1, 5).map(cell => {
                // Prefer anchor title attribute when present to avoid mojibake
                const m = cell.match(/<a[^>]*\btitle=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
                if (m) {
                    return stripHtml(m[1] || m[2]);
                }
                return stripHtml(cell);
            }).filter(Boolean);
            if (!name || songs.length === 0) continue;
            const charts = songs.map(s => `${s}:expert:single`);
            courses.push({ name, charts, style: 'single', color: '#46aadc' });
        }
        return courses;
    } catch (err) {
        console.warn('Failed to parse A3 HTML:', err.message);
        return [];
    }
}

function mapSectionHeaderToGame(header) {
    const h = (header || '').toLowerCase();
    if (h.includes(' a3')) return 'A3';
    if (h.includes(' a20 plus')) return 'A20 Plus';
    if (h.includes(' a20')) return 'A20';
    if (h.includes(' 2014')) return '2014';
    if (h.includes(' 2013')) return '2013';
    if (h.includes(' x3')) return 'X3 vs 2nd';
    if (h.includes(' x2')) return 'X2';
    if (h.includes(' x ')) return 'X';
    if (h.includes('sn2')) return 'SN2';
    if (h.includes('sn1') || h.includes('supernova')) return 'SN1';
    if (h.includes('extreme') || h.includes(' ex ')) return 'EX';
    if (h.includes(' 7th')) return '7th';
    if (h.includes(' 6th')) return '6th';
    if (h.includes(' 5th')) return '5th';
    if (h.includes(' 4th')) return '4th';
    if (h.includes(' 3rd')) return '3rd';
    if (h.includes(' 2nd')) return '2nd';
    if (h.includes('ddr')) return 'DDR';
    return 'World';
}

function extractTextOrTitle(cellHtml) {
    const anchor = cellHtml.match(/<a[^>]*\btitle=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/i);
    if (anchor) return stripHtml(anchor[1] || anchor[2]);
    return stripHtml(cellHtml);
}

function parseSongCellForModes(cellHtml) {
    const parts = String(cellHtml).split(/<br\s*\/?>(?![^<]*<br)/i);
    let single = null, double = null;
    for (const p of parts) {
        const hasSingle = /\(\s*SINGLE\s*\)/i.test(p);
        const hasDouble = /\(\s*DOUBLE\s*\)/i.test(p);
        const title = extractTextOrTitle(p.replace(/<small[^>]*>[^<]*<\/small>/ig, ''));
        if (hasSingle && !single) single = title;
        if (hasDouble && !double) double = title;
    }
    if (!single || !double) {
        const generic = extractTextOrTitle(cellHtml.replace(/<small[^>]*>[^<]*<\/small>/ig, ''));
        if (!single) single = generic;
        if (!double) double = generic;
    }
    return { single, double };
}

function parseLevelCell(cellHtml) {
    const t = stripHtml(cellHtml);
    const m = t.match(/(-?\d+)/);
    return m ? Number(m[1]) : null;
}

async function parseUnifiedCourseHtml(htmlPath) {
    const html = await fs.readFile(htmlPath, 'utf-8');
    const sections = [];
    const re = /(\n|^)\s*([^\n<][^\n]*?)\s*\n\s*(<table[\s\S]*?<\/table>)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        sections.push({ header: stripHtml(m[2]), table: m[3] });
    }
    const result = new Map();
    for (const sec of sections) {
        const game = mapSectionHeaderToGame(sec.header);
        const hasVariantHeaders = /<th[^>]*>\s*Normal\s*<\/th>[\s\S]*?<th[^>]*>\s*Difficult\s*<\/th>/i.test(sec.table);
        const hasAStages = /<th[^>]*>\s*1st\s*<\/th>[\s\S]*?<th[^>]*>\s*2nd\s*<\/th>[\s\S]*?<th[^>]*>\s*3rd\s*<\/th>[\s\S]*?<th[^>]*>\s*FINAL\s*<\/th>/i.test(sec.table);
        const rows = [...sec.table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map(x => x[1]);
        let currentCourseName = null;
        for (const row of rows) {
            const th = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
            if (hasAStages) {
                const tdsA = [...row.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
                if (tdsA.length >= 5) {
                    const name = stripHtml(tdsA[0]);
                    const songs = tdsA.slice(1, 5).map(extractTextOrTitle).filter(Boolean);
                    if (name && songs.length > 0) {
                        if (!result.has(game)) result.set(game, []);
                        result.get(game).push({ name, style: 'single', charts: songs.map(s => `${s}:expert:single`), color: '#46aadc' });
                    }
                }
                continue;
            }
            if (th && !/Single Difficulty|Double Difficulty|Normal|Difficult|Default courses|Name|STAGE/i.test(th[1])) {
                currentCourseName = stripHtml(th[1]);
                continue;
            }
            const tds = [...row.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
            if (!currentCourseName || tds.length === 0) continue;
            const songCell = tds[1] || '';
            const { single: spTitle, double: dpTitle } = parseSongCellForModes(songCell);
            if (!spTitle && !dpTitle) continue;
            if (hasVariantHeaders) {
                const sn = parseLevelCell(tds[2] || '');
                const sd = parseLevelCell(tds[3] || '');
                const dn = parseLevelCell(tds[4] || '');
                const dd = parseLevelCell(tds[5] || '');
                const pushCourse = (name, variant, mode, title, level) => {
                    if (title == null || level == null) return;
                    if (!result.has(game)) result.set(game, []);
                    let list = result.get(game);
                    let c = list.find(x => x.name === `${name} (${variant})` && x.style === mode);
                    if (!c) {
                        c = { name: `${name} (${variant})`, style: mode, charts: [], items: [], color: mode === 'double' ? '#9b59b6' : '#46aadc' };
                        list.push(c);
                    }
                    c.items.push({ title, mode, level });
                };
                if (sn != null) pushCourse(currentCourseName, 'Normal', 'single', spTitle, sn);
                if (sd != null) pushCourse(currentCourseName, 'Difficult', 'single', spTitle, sd);
                if (dn != null) pushCourse(currentCourseName, 'Normal', 'double', dpTitle, dn);
                if (dd != null) pushCourse(currentCourseName, 'Difficult', 'double', dpTitle, dd);
            } else {
                const s = parseLevelCell(tds[2] || '');
                const d = parseLevelCell(tds[3] || '');
                if (!result.has(game)) result.set(game, []);
                const list = result.get(game);
                if (s != null) {
                    let csp = list.find(x => x.name === currentCourseName && x.style === 'single');
                    if (!csp) {
                        csp = { name: currentCourseName, style: 'single', charts: [], items: [], color: '#46aadc' };
                        list.push(csp);
                    }
                    csp.items.push({ title: spTitle, mode: 'single', level: s });
                }
                if (d != null) {
                    let cdp = list.find(x => x.name === currentCourseName && x.style === 'double');
                    if (!cdp) {
                        cdp = { name: currentCourseName, style: 'double', charts: [], items: [], color: '#9b59b6' };
                        list.push(cdp);
                    }
                    cdp.items.push({ title: dpTitle, mode: 'double', level: d });
                }
            }
        }
    }
    return result;
}

function pickChartByFeet(simfileData, mode, targetFeet) {
    const candidates = simfileData.availableTypes.filter(c => c.mode === mode);
    if (candidates.length === 0) return null;
    let best = null;
    let bestDiff = Infinity;
    for (const c of candidates) {
        const diff = Math.abs((c.feet ?? 0) - targetFeet);
        if (diff < bestDiff) { best = c; bestDiff = diff; }
        if (diff === 0) break;
    }
    return best;
}

const processCourseListByLevel = async (courses, smFiles, singleRankMap, doubleRankMap, songIdMapState, gameHint = null) => {
    if (!courses) return [];
    const processedCourses = [];
    for (const course of courses) {
        const processedSongs = [];
        for (const item of course.items || []) {
            const { title, mode, level } = item;
            const songFile = findSongFile(title, smFiles, gameHint);
            if (!songFile) {
                console.warn(`Song not found for course level item: ${title}`);
                processedSongs.push({ title, mode, level, error: 'Song file not found' });
                continue;
            }
            const smFilePath = path.join(PUBLIC_DIR, songFile.path);
            const simfileData = await readSmFile(smFilePath);
            if (!simfileData) {
                processedSongs.push({ title, mode, level, error: 'Failed to load simfile' });
                continue;
            }
            const { id: ensuredId, created } = ensureSongId(songIdMapState.map, songFile.path);
            if (created) songIdMapState.changed = true;
            const songId = songFile.id || ensuredId;

            const chart = pickChartByFeet(simfileData, mode, Number(level));
            if (!chart) {
                processedSongs.push({ title, mode, level, error: 'Chart not found in simfile' });
                continue;
            }
            const chartDetails = simfileData.charts[chart.slug];
            const bpms = chartDetails.bpm.map(b => b.bpm).filter(b => b > 0);
            const bpmDisplay = bpms.length === 1 ? String(Math.round(bpms[0])) : `${Math.round(Math.min(...bpms))}-${Math.round(Math.max(...bpms))}`;
            const game = songFile.path.split('/')[1] || 'N/A';

            const ratingsSingle = getRatingsForTitle(simfileData.title, singleRankMap);
            const ratingsDouble = getRatingsForTitle(simfileData.title, doubleRankMap);
            const ratingArrByMode = { single: ratingsSingle, double: ratingsDouble };
            const rankedRating = pickRatingForLevel(ratingArrByMode[chart.mode], chart.feet);
            const chartId = buildChartId(songId, chart.mode, chart.difficulty);

            processedSongs.push({
                title: simfileData.title,
                level: chart.feet,
                bpm: bpmDisplay,
                difficulty: chart.difficulty,
                mode: chart.mode,
                game: game,
                rankedRating,
                songId,
                chartId,
                path: songFile.path,
                artist: simfileData.artist,
            });
        }
        const chartIds = processedSongs.map(s => s.chartId).filter(Boolean);
        processedCourses.push({ name: course.name, style: course.style, color: course.color, songs: processedSongs, chartIds });
    }
    return processedCourses;
};


async function main() {
    try {
        console.log('Starting data processing...');
        const smFiles = await readJson(SM_FILES_PATH);
        const courseData = await readJson(COURSE_DATA_PATH);
        const combinedRatings = await readJson(COMBINED_RATINGS_PATH).catch(() => []);
        const singleRankMap = buildRatingMap(combinedRatings, 'single_rankings');
        const doubleRankMap = buildRatingMap(combinedRatings, 'doubles_rankings');
        const songIdMap = await loadSongIdMap();
        const songIdMapState = { map: songIdMap, changed: false };

        // Process Dan data
        const processedDanSingle = await processCourseList(courseData.dan.single, smFiles, singleRankMap, doubleRankMap, songIdMapState);
        const processedDanDouble = await processCourseList(courseData.dan.double, smFiles, singleRankMap, doubleRankMap, songIdMapState);
        const danResult = {
            single: processedDanSingle,
            double: processedDanDouble,
        };
        await fs.writeFile(DAN_OUTPUT_PATH, JSON.stringify(danResult, null, 2));
        console.log(`Successfully generated Dan data at ${DAN_OUTPUT_PATH}`);

        // Process Vega data
        const vegaResult = {};
        for (const month in courseData.vega) {
            if (Object.hasOwnProperty.call(courseData.vega, month)) {
                vegaResult[month] = await processCourseList(courseData.vega[month], smFiles, singleRankMap, doubleRankMap, songIdMapState);
            }
        }
        await fs.writeFile(VEGA_OUTPUT_PATH, JSON.stringify(vegaResult, null, 2));
        console.log(`Successfully generated Vega data at ${VEGA_OUTPUT_PATH}`);
        if (songIdMapState.changed) {
            await saveSongIdMap(songIdMapState.map);
        }

        // Process Courses from new HTML source if present; fallback to .crs otherwise
        try {
            const resultByGame = {};
            const haveNewHtml = await fs.stat(COURSE_DATA_HTML).then(() => true).catch(() => false);
            if (haveNewHtml) {
                const mapByGame = await parseUnifiedCourseHtml(COURSE_DATA_HTML);
                for (const [game, courses] of mapByGame.entries()) {
                    const hint = game;
                    const out = [];
                    for (const c of courses) {
                        if (Array.isArray(c.items) && c.items.length > 0) {
                            const arr = await processCourseListByLevel([c], smFiles, singleRankMap, doubleRankMap, songIdMapState, hint);
                            out.push(...arr);
                        } else if (Array.isArray(c.charts) && c.charts.length > 0) {
                            const arr = await processCourseList([c], smFiles, singleRankMap, doubleRankMap, songIdMapState, hint);
                            out.push(...arr);
                        }
                    }
                    resultByGame[game] = out;
                }
            } else {
                const haveCourses = await fs.stat(DDR_COURSES_DIR).then(() => true).catch(() => false);
                if (haveCourses) {
                    const crsByGame = await collectCrsCourses(DDR_COURSES_DIR);
                    const a3HtmlPath = path.join(DDR_COURSES_DIR, 'DDR A3.html');
                    const a3Courses = await parseA3Html(a3HtmlPath);
                    if (a3Courses.length > 0) {
                        const processedA3 = await processCourseList(a3Courses, smFiles, singleRankMap, doubleRankMap, songIdMapState, 'A3');
                        resultByGame['A3'] = processedA3;
                    }
                    for (const [game, courses] of crsByGame.entries()) {
                        const hint = mapCoursesGameToSm(game) || undefined;
                        resultByGame[hint || game] = await processCourseList(courses, smFiles, singleRankMap, doubleRankMap, songIdMapState, hint);
                    }
                } else {
                    console.warn('No courses source found; skipping courses-data.json');
                }
            }
            await fs.writeFile(COURSES_OUTPUT_PATH, JSON.stringify(resultByGame, null, 2));
            console.log(`Successfully generated Courses data at ${COURSES_OUTPUT_PATH}`);
        } catch (err) {
            console.error('Error generating courses-data.json:', err);
        }

    } catch (error) {
        console.error('Error generating processed data:', error);
        process.exit(1);
    }
}

main();
