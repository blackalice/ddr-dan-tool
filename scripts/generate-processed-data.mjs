import { promises as fs } from 'fs';
import path from 'path';
import Fraction from "fraction.js";

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


const readJson = async (filePath) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
};

const readSmFile = async (filePath) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseSm(content);
};

const findSongFile = (title, smFiles) => {
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedTitle = normalize(title);
    
    return smFiles.files.find(file => 
        normalize(file.title) === normalizedTitle || 
        (file.titleTranslit && normalize(file.titleTranslit) === normalizedTitle)
    );
};

const processCourseList = async (courses, smFiles) => {
    if (!courses) return [];
    const processedCourses = [];

    for (const course of courses) {
        const processedSongs = [];
        for (const shortCode of course.charts) {
            const parts = shortCode.split(':');
            const mode = parts.pop();
            const difficulty = parts.pop();
            const title = parts.join(':');
            
            const songFile = findSongFile(title, smFiles);
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

            processedSongs.push({
                title: simfileData.title,
                level: chart.feet,
                bpm: bpmDisplay,
                difficulty: chart.difficulty,
                mode: chart.mode,
                game: game,
            });
        }
        processedCourses.push({ ...course, songs: processedSongs });
    }
    return processedCourses;
};


async function main() {
    try {
        console.log('Starting data processing...');
        const smFiles = await readJson(SM_FILES_PATH);
        const courseData = await readJson(COURSE_DATA_PATH);

        // Process Dan data
        const processedDanSingle = await processCourseList(courseData.dan.single, smFiles);
        const processedDanDouble = await processCourseList(courseData.dan.double, smFiles);
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
                vegaResult[month] = await processCourseList(courseData.vega[month], smFiles);
            }
        }
        await fs.writeFile(VEGA_OUTPUT_PATH, JSON.stringify(vegaResult, null, 2));
        console.log(`Successfully generated Vega data at ${VEGA_OUTPUT_PATH}`);

    } catch (error) {
        console.error('Error generating processed data:', error);
        process.exit(1);
    }
}

main();
