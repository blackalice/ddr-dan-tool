import Fraction from "fraction.js";
import {
  determineBeat,
  mergeSimilarBpmRanges,
  normalizedDifficultyMap,
} from "./smParserUtils.js";

const metaTagsToConsume = ["title", "titletranslit", "artist", "banner", "music"];

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

export function parseSm(sm) {
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
    const freezes = parseFreezes(notesLines, firstNonEmptyMeasureIndex, mode, difficulty, title);
    return { arrows, freezes, numMeasuresSkipped };
  };

  try {
    if (sm.includes('#NOTEDATA')) { // SSC Logic
      const header = sm.split('#NOTEDATA')[0];
      sc.title = getTagValue(header, 'TITLE');
      sc.titletranslit = getTagValue(header, 'TITLETRANSLIT');
      sc.artist = getTagValue(header, 'ARTIST');
      sc.banner = getTagValue(header, 'BANNER');
      sc.music = getTagValue(header, 'MUSIC');
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
          } else if (tag === "music") {
            sc.music = value;
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
