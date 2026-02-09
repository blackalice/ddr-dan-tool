// SPDX-License-Identifier: GPL-3.0-or-later
//
// Build-time JS port of ITGmania StepParity + TechCounts logic for dance-single/double.
// Derived from ITGmania/StepMania source implementations.
// ITGmania: https://github.com/itgmania/itgmania
// StepMania: https://github.com/stepmania/stepmania
// Sources:
// - _archive/itgmania-source/src/StepParityDatastructs.*
// - _archive/itgmania-source/src/StepParityGenerator.*
// - _archive/itgmania-source/src/StepParityCost.*
// - _archive/itgmania-source/src/TechCounts.*

const INVALID_COLUMN = -1;
const CLM_SECOND_INVALID = -1;

const FOOT = {
  NONE: 0,
  LEFT_HEEL: 1,
  LEFT_TOE: 2,
  RIGHT_HEEL: 3,
  RIGHT_TOE: 4,
};

const FEET = [FOOT.LEFT_HEEL, FOOT.LEFT_TOE, FOOT.RIGHT_HEEL, FOOT.RIGHT_TOE];
const OTHER_PART_OF_FOOT = [FOOT.NONE, FOOT.LEFT_TOE, FOOT.LEFT_HEEL, FOOT.RIGHT_TOE, FOOT.RIGHT_HEEL];

const NOTE_TYPE = {
  EMPTY: 0,
  TAP: 1,
  HOLD_HEAD: 2,
  MINE: 3,
  FAKE: 4,
};

// StepParityCost constants
const DOUBLESTEP = 850;
const BRACKETJACK = 20;
const JACK = 30;
const SLOW_BRACKET = 300;
const TWISTED_FOOT = 100000;
const BRACKETTAP = 400;
const HOLDSWITCH = 55;
const MINE = 10000;
const FOOTSWITCH = 325;
const MISSED_FOOTSWITCH = 500;
const FACING = 2;
const DISTANCE = 6;
const SPIN = 1000;
const SIDESWITCH = 130;
const OTHER = 0;

const JACK_THRESHOLD = 0.1;
const SLOW_BRACKET_THRESHOLD = 0.15;
const SLOW_FOOTSWITCH_THRESHOLD = 0.2;
const SLOW_FOOTSWITCH_IGNORE = 0.4;

// TechCounts thresholds
const JACK_CUTOFF = 0.176;
const FOOTSWITCH_CUTOFF = 0.3;
const DOUBLESTEP_CUTOFF = 0.235;

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function approxEqual(a, b, epsilon = 1e-6) {
  return Math.abs(safeNumber(a) - safeNumber(b)) <= epsilon;
}

function timeAtOffset(bpmRanges, stops, targetOffset) {
  if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0;
  const sorted = [...bpmRanges].sort((a, b) => safeNumber(a.startOffset) - safeNumber(b.startOffset));
  const stopList = Array.isArray(stops) ? stops : [];
  const target = safeNumber(targetOffset);

  let time = 0;
  let pos = safeNumber(sorted[0]?.startOffset);

  for (let i = 0; i < sorted.length; i += 1) {
    const seg = sorted[i] || {};
    const segStart = safeNumber(seg.startOffset);
    const segEndRaw = seg.endOffset == null ? target : safeNumber(seg.endOffset);
    const start = Math.max(pos, segStart);
    const end = Math.min(target, segEndRaw);

    if (end > start && safeNumber(seg.bpm) > 0) {
      const beats = (end - start) * 4;
      time += (beats / safeNumber(seg.bpm)) * 60;
      for (const stop of stopList) {
        const offset = safeNumber(stop?.offset);
        if (offset >= start && offset < end) {
          time += safeNumber(stop?.duration);
        }
      }
    }
    pos = end;
    if (pos >= target) break;
  }

  return time;
}

function splitNotesIntoMeasures(notesText, laneCount) {
  if (typeof notesText !== 'string' || notesText.trim().length === 0) return [];
  const lines = notesText.replace(/\r\n?/g, '\n').split('\n');
  const measures = [];
  let current = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    if (line.startsWith(';') || line.startsWith(',;')) break;
    if (line.startsWith(',')) {
      measures.push(current);
      current = [];
      continue;
    }
    const normalized = line.replace(/\s+/g, '');
    if (!normalized || normalized.startsWith('#') || normalized.includes(':')) continue;
    current.push(normalized.slice(0, laneCount));
  }

  measures.push(current);
  while (measures.length > 0 && measures[measures.length - 1].length === 0) {
    measures.pop();
  }
  return measures;
}

class StageLayout {
  constructor(columns, upArrows, downArrows, sideArrows) {
    this.columns = columns;
    this.upArrows = upArrows;
    this.downArrows = downArrows;
    this.sideArrows = sideArrows;
    this.columnCount = columns.length;
  }

  bracketCheck(column1, column2) {
    return this.getDistanceSqByPoint(this.columns[column1], this.columns[column2]) <= 2;
  }

  getDistanceSq(c1, c2) {
    return this.getDistanceSqByPoint(this.columns[c1], this.columns[c2]);
  }

  getDistanceSqByPoint(p1, p2) {
    return ((p1.y - p2.y) * (p1.y - p2.y)) + ((p1.x - p2.x) * (p1.x - p2.x));
  }

  getXDifference(leftIndex, rightIndex) {
    if (leftIndex === rightIndex) return 0;
    let dx = this.columns[rightIndex].x - this.columns[leftIndex].x;
    let dy = this.columns[rightIndex].y - this.columns[leftIndex].y;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance === 0) return 0;
    dx /= distance;
    const negative = dx <= 0;
    dx = Math.pow(dx, 4);
    if (negative) dx = -dx;
    return dx;
  }

  getYDifference(leftIndex, rightIndex) {
    if (leftIndex === rightIndex) return 0;
    let dx = this.columns[rightIndex].x - this.columns[leftIndex].x;
    let dy = this.columns[rightIndex].y - this.columns[leftIndex].y;
    const distance = Math.sqrt((dx * dx) + (dy * dy));
    if (distance === 0) return 0;
    dy /= distance;
    const negative = dy <= 0;
    dy = Math.pow(dy, 4);
    if (negative) dy = -dy;
    return dy;
  }

  averagePoint(leftIndex, rightIndex) {
    if (leftIndex === INVALID_COLUMN && rightIndex === INVALID_COLUMN) return { x: 0, y: 0 };
    if (leftIndex === INVALID_COLUMN) return this.columns[rightIndex];
    if (rightIndex === INVALID_COLUMN) return this.columns[leftIndex];
    return {
      x: (this.columns[leftIndex].x + this.columns[rightIndex].x) / 2,
      y: (this.columns[leftIndex].y + this.columns[rightIndex].y) / 2,
    };
  }
}

const SINGLE_LAYOUT = new StageLayout(
  [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 1 },
  ],
  [2],
  [1],
  [0, 3],
);

const DOUBLE_LAYOUT = new StageLayout(
  [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 5, y: 1 },
  ],
  [2, 6],
  [1, 5],
  [0, 3, 4, 7],
);

function getLayout(laneCount) {
  if (laneCount === 4) return SINGLE_LAYOUT;
  if (laneCount === 8) return DOUBLE_LAYOUT;
  return null;
}

function createEmptyNote(col = 0) {
  return {
    type: NOTE_TYPE.EMPTY,
    col,
    row: 0,
    beat: 0,
    hold_length: -1,
    fake: false,
    second: 0,
    parity: FOOT.NONE,
  };
}

function createRow(columnCount) {
  return {
    notes: Array.from({ length: columnCount }, (_, col) => createEmptyNote(col)),
    holds: Array.from({ length: columnCount }, (_, col) => createEmptyNote(col)),
    holdTails: new Set(),
    mines: new Array(columnCount).fill(0),
    fakeMines: new Array(columnCount).fill(0),
    columns: new Array(columnCount).fill(FOOT.NONE),
    whereTheFeetAre: new Array(FOOT.RIGHT_TOE + 1).fill(INVALID_COLUMN),
    second: 0,
    beat: 0,
    rowIndex: 0,
    columnCount,
    noteCount: 0,
  };
}

function setRowFootPlacement(row, footPlacement) {
  row.columns.fill(FOOT.NONE);
  row.whereTheFeetAre.fill(INVALID_COLUMN);
  row.noteCount = 0;
  for (let c = 0; c < row.columnCount; c += 1) {
    if (row.notes[c].type === NOTE_TYPE.EMPTY) continue;
    const foot = footPlacement[c];
    if (foot === FOOT.NONE) continue;
    row.notes[c].parity = foot;
    row.columns[c] = foot;
    row.whereTheFeetAre[foot] = c;
    row.noteCount += 1;
  }
}

function createState(columnCount) {
  return {
    columns: new Array(columnCount).fill(FOOT.NONE),
    combinedColumns: new Array(columnCount).fill(FOOT.NONE),
    movedFeet: new Array(columnCount).fill(FOOT.NONE),
    holdFeet: new Array(columnCount).fill(FOOT.NONE),
    whereTheFeetAre: new Array(FOOT.RIGHT_TOE + 1).fill(INVALID_COLUMN),
    whatNoteTheFootIsHitting: new Array(FOOT.RIGHT_TOE + 1).fill(INVALID_COLUMN),
    didTheFootMove: new Array(FOOT.RIGHT_TOE + 1).fill(false),
    isTheFootHolding: new Array(FOOT.RIGHT_TOE + 1).fill(false),
  };
}

function makeStateCacheKey(state) {
  return `${state.columns.join(',')}|${state.combinedColumns.join(',')}|${state.movedFeet.join(',')}|${state.holdFeet.join(',')}`;
}

function cloneFootPlacement(columns) {
  return columns.slice();
}

function parseChartToIntermediateNotes(chart, laneCount) {
  const notesText = typeof chart?.notes === 'string' ? chart.notes : '';
  const measures = splitNotesIntoMeasures(notesText, laneCount);
  const bpm = Array.isArray(chart?.bpm) ? chart.bpm : [];
  const stops = Array.isArray(chart?.stops) ? chart.stops : [];
  const noteData = [];
  const openHoldsByCol = new Map();
  let globalRow = 0;

  for (let m = 0; m < measures.length; m += 1) {
    const measureRows = measures[m];
    const rowCount = measureRows.length;
    if (rowCount <= 0) continue;

    for (let r = 0; r < rowCount; r += 1) {
      const row = String(measureRows[r] || '').padEnd(laneCount, '0').slice(0, laneCount);
      const offset = m + (r / rowCount);
      const beat = offset * 4;
      const second = timeAtOffset(bpm, stops, offset);

      for (let col = 0; col < laneCount; col += 1) {
        const ch = row[col] || '0';

        if (ch === '2' || ch === '4') {
          const entry = {
            type: NOTE_TYPE.HOLD_HEAD,
            col,
            row: globalRow,
            beat,
            hold_length: -1,
            fake: false,
            second,
            parity: FOOT.NONE,
          };
          noteData.push(entry);
          openHoldsByCol.set(col, entry);
          continue;
        }

        if (ch === '3') {
          const head = openHoldsByCol.get(col);
          if (head) {
            head.hold_length = Math.max(0, beat - head.beat);
            openHoldsByCol.delete(col);
          }
          continue;
        }

        if (ch === '1') {
          noteData.push({
            type: NOTE_TYPE.TAP,
            col,
            row: globalRow,
            beat,
            hold_length: -1,
            fake: false,
            second,
            parity: FOOT.NONE,
          });
          continue;
        }

        if (ch === 'M') {
          noteData.push({
            type: NOTE_TYPE.MINE,
            col,
            row: globalRow,
            beat,
            hold_length: -1,
            fake: false,
            second,
            parity: FOOT.NONE,
          });
          continue;
        }

        if (ch === 'F') {
          noteData.push({
            type: NOTE_TYPE.FAKE,
            col,
            row: globalRow,
            beat,
            hold_length: -1,
            fake: true,
            second,
            parity: FOOT.NONE,
          });
        }
      }

      globalRow += 1;
    }
  }

  noteData.sort((a, b) => {
    const ds = safeNumber(a.second) - safeNumber(b.second);
    if (Math.abs(ds) > 1e-7) return ds;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return noteData;
}

function buildRowsFromChart(chart, laneCount) {
  const noteData = parseChartToIntermediateNotes(chart, laneCount);
  if (noteData.length === 0) return [];

  const rows = [];
  const counter = {
    notes: Array.from({ length: laneCount }, (_, col) => createEmptyNote(col)),
    activeHolds: Array.from({ length: laneCount }, (_, col) => createEmptyNote(col)),
    lastColumnSecond: CLM_SECOND_INVALID,
    lastColumnBeat: CLM_SECOND_INVALID,
    mines: new Array(laneCount).fill(0),
    fakeMines: new Array(laneCount).fill(0),
    nextMines: new Array(laneCount).fill(0),
    nextFakeMines: new Array(laneCount).fill(0),
  };

  const addRow = () => {
    const row = createRow(laneCount);
    row.notes = counter.notes.map((note, col) => ({ ...note, col }));
    row.mines = counter.nextMines.slice();
    row.fakeMines = counter.nextFakeMines.slice();
    row.second = counter.lastColumnSecond;
    row.beat = counter.lastColumnBeat;
    row.rowIndex = rows.length;

    for (let c = 0; c < laneCount; c += 1) {
      const hold = counter.activeHolds[c];
      if (hold.type === NOTE_TYPE.EMPTY || hold.second >= counter.lastColumnSecond) {
        row.holds[c] = createEmptyNote(c);
      } else {
        row.holds[c] = { ...hold, col: c };
      }
      if (
        hold.type !== NOTE_TYPE.EMPTY
        && hold.hold_length >= 0
        && Math.abs((hold.beat + hold.hold_length) - counter.lastColumnBeat) < 0.0005
      ) {
        row.holdTails.add(c);
      }
    }
    rows.push(row);
  };

  for (const note of noteData) {
    if (note.type === NOTE_TYPE.EMPTY) continue;

    if (note.type === NOTE_TYPE.MINE) {
      if (approxEqual(note.second, counter.lastColumnSecond) && rows.length > 0) {
        if (note.fake) counter.nextFakeMines[note.col] = note.second;
        else counter.nextMines[note.col] = note.second;
      } else {
        if (note.fake) counter.fakeMines[note.col] = note.second;
        else counter.mines[note.col] = note.second;
      }
      continue;
    }

    if (note.fake) continue;

    if (!approxEqual(counter.lastColumnSecond, note.second)) {
      if (counter.lastColumnSecond !== CLM_SECOND_INVALID) {
        addRow();
      }

      counter.lastColumnSecond = note.second;
      counter.lastColumnBeat = note.beat;
      counter.nextMines = counter.mines.slice();
      counter.nextFakeMines = counter.fakeMines.slice();
      counter.notes = Array.from({ length: laneCount }, (_, col) => createEmptyNote(col));
      counter.mines = new Array(laneCount).fill(0);
      counter.fakeMines = new Array(laneCount).fill(0);

      for (let c = 0; c < laneCount; c += 1) {
        const hold = counter.activeHolds[c];
        if (hold.type === NOTE_TYPE.EMPTY || note.beat > (hold.beat + hold.hold_length)) {
          counter.activeHolds[c] = createEmptyNote(c);
        }
      }
    }

    counter.notes[note.col] = { ...note };
    if (note.type === NOTE_TYPE.HOLD_HEAD) {
      counter.activeHolds[note.col] = { ...note };
    }
  }

  if (counter.lastColumnSecond !== CLM_SECOND_INVALID) {
    addRow();
  }
  return rows;
}

function isEmptyFootArray(vec) {
  for (let i = 0; i < vec.length; i += 1) {
    if (Number(vec[i]) !== 0) return false;
  }
  return true;
}

function countActiveNotes(notes) {
  let count = 0;
  for (let i = 0; i < notes.length; i += 1) {
    if (notes[i]?.type !== NOTE_TYPE.EMPTY) count += 1;
  }
  return count;
}

function mergeInitialAndResultPosition(initialState, resultState, columnCount) {
  for (let i = 0; i < columnCount; i += 1) {
    if (resultState.columns[i] !== FOOT.NONE) {
      resultState.combinedColumns[i] = resultState.columns[i];
      continue;
    }

    if (
      initialState.combinedColumns[i] === FOOT.LEFT_HEEL
      || initialState.combinedColumns[i] === FOOT.RIGHT_HEEL
    ) {
      if (!resultState.didTheFootMove[initialState.combinedColumns[i]]) {
        resultState.combinedColumns[i] = initialState.combinedColumns[i];
      }
    } else if (initialState.combinedColumns[i] === FOOT.LEFT_TOE) {
      if (!resultState.didTheFootMove[FOOT.LEFT_TOE] && !resultState.didTheFootMove[FOOT.LEFT_HEEL]) {
        resultState.combinedColumns[i] = initialState.combinedColumns[i];
      }
    } else if (initialState.combinedColumns[i] === FOOT.RIGHT_TOE) {
      if (!resultState.didTheFootMove[FOOT.RIGHT_TOE] && !resultState.didTheFootMove[FOOT.RIGHT_HEEL]) {
        resultState.combinedColumns[i] = initialState.combinedColumns[i];
      }
    }
  }

  for (let i = 0; i < columnCount; i += 1) {
    const foot = resultState.combinedColumns[i];
    if (foot !== FOOT.NONE) {
      resultState.whereTheFeetAre[foot] = i;
    }
  }
}

function initResultState(initialState, row, columns, stateCache) {
  const columnCount = row.columnCount;
  const resultState = createState(columnCount);

  for (let i = 0; i < columnCount; i += 1) {
    const foot = columns[i];
    resultState.columns[i] = foot;
    if (foot === FOOT.NONE) continue;

    resultState.whatNoteTheFootIsHitting[foot] = i;

    if (row.holds[i].type === NOTE_TYPE.EMPTY) {
      resultState.movedFeet[i] = foot;
      resultState.didTheFootMove[foot] = true;
      continue;
    }
    if (initialState.combinedColumns[i] !== foot) {
      resultState.movedFeet[i] = foot;
      resultState.didTheFootMove[foot] = true;
    }
  }

  for (let i = 0; i < columnCount; i += 1) {
    const foot = columns[i];
    if (foot === FOOT.NONE) continue;
    if (row.holds[i].type !== NOTE_TYPE.EMPTY) {
      resultState.holdFeet[i] = foot;
      resultState.isTheFootHolding[foot] = true;
    }
  }

  mergeInitialAndResultPosition(initialState, resultState, columnCount);
  const cacheKey = makeStateCacheKey(resultState);
  const cached = stateCache.get(cacheKey);
  if (cached) return cached;
  stateCache.set(cacheKey, resultState);
  return resultState;
}

function getPermuteCacheKey(row) {
  let key = 0;
  for (let i = 0; i < row.notes.length && i < row.holds.length; i += 1) {
    if (row.notes[i].type !== NOTE_TYPE.EMPTY || row.holds[i].type !== NOTE_TYPE.EMPTY) {
      key += 2 ** i;
    }
  }
  return key;
}

function permuteFootPlacements(row, layout, columns, columnIndex, ignoreHolds) {
  if (columnIndex >= columns.length) {
    let leftHeelIndex = INVALID_COLUMN;
    let leftToeIndex = INVALID_COLUMN;
    let rightHeelIndex = INVALID_COLUMN;
    let rightToeIndex = INVALID_COLUMN;

    for (let i = 0; i < columns.length; i += 1) {
      const foot = columns[i];
      if (foot === FOOT.NONE) continue;
      if (foot === FOOT.LEFT_HEEL) leftHeelIndex = i;
      if (foot === FOOT.LEFT_TOE) leftToeIndex = i;
      if (foot === FOOT.RIGHT_HEEL) rightHeelIndex = i;
      if (foot === FOOT.RIGHT_TOE) rightToeIndex = i;
    }

    if (
      (leftHeelIndex === INVALID_COLUMN && leftToeIndex !== INVALID_COLUMN)
      || (rightHeelIndex === INVALID_COLUMN && rightToeIndex !== INVALID_COLUMN)
    ) {
      return [];
    }
    if (leftHeelIndex !== INVALID_COLUMN && leftToeIndex !== INVALID_COLUMN) {
      if (!layout.bracketCheck(leftHeelIndex, leftToeIndex)) return [];
    }
    if (rightHeelIndex !== INVALID_COLUMN && rightToeIndex !== INVALID_COLUMN) {
      if (!layout.bracketCheck(rightHeelIndex, rightToeIndex)) return [];
    }
    return [columns];
  }

  const hasPlayable = row.notes[columnIndex].type !== NOTE_TYPE.EMPTY
    || (!ignoreHolds && row.holds[columnIndex].type !== NOTE_TYPE.EMPTY);

  if (hasPlayable) {
    const permutations = [];
    for (const foot of FEET) {
      if (columns.includes(foot)) continue;
      const next = cloneFootPlacement(columns);
      next[columnIndex] = foot;
      const p = permuteFootPlacements(row, layout, next, columnIndex + 1, ignoreHolds);
      permutations.push(...p);
    }
    return permutations;
  }

  return permuteFootPlacements(row, layout, columns, columnIndex + 1, ignoreHolds);
}

function didJackLeft(initialState, resultState, leftHeel, leftToe, movedLeft, didJump) {
  let jackedLeft = false;
  if (!didJump && movedLeft) {
    if (
      leftHeel > INVALID_COLUMN
      && initialState.combinedColumns[leftHeel] === FOOT.LEFT_HEEL
      && !resultState.isTheFootHolding[FOOT.LEFT_HEEL]
      && (
        (initialState.didTheFootMove[FOOT.LEFT_HEEL] && !initialState.isTheFootHolding[FOOT.LEFT_HEEL])
        || (initialState.didTheFootMove[FOOT.LEFT_TOE] && !initialState.isTheFootHolding[FOOT.LEFT_TOE])
      )
    ) {
      jackedLeft = true;
    }
    if (
      leftToe > INVALID_COLUMN
      && initialState.combinedColumns[leftToe] === FOOT.LEFT_TOE
      && !resultState.isTheFootHolding[FOOT.LEFT_TOE]
      && (
        (initialState.didTheFootMove[FOOT.LEFT_HEEL] && !initialState.isTheFootHolding[FOOT.LEFT_HEEL])
        || (initialState.didTheFootMove[FOOT.LEFT_TOE] && !initialState.isTheFootHolding[FOOT.LEFT_TOE])
      )
    ) {
      jackedLeft = true;
    }
  }
  return jackedLeft;
}

function didJackRight(initialState, resultState, rightHeel, rightToe, movedRight, didJump) {
  let jackedRight = false;
  if (!didJump && movedRight) {
    if (
      rightHeel > INVALID_COLUMN
      && initialState.combinedColumns[rightHeel] === FOOT.RIGHT_HEEL
      && !resultState.isTheFootHolding[FOOT.RIGHT_HEEL]
      && (
        (initialState.didTheFootMove[FOOT.RIGHT_HEEL] && !initialState.isTheFootHolding[FOOT.RIGHT_HEEL])
        || (initialState.didTheFootMove[FOOT.RIGHT_TOE] && !initialState.isTheFootHolding[FOOT.RIGHT_TOE])
      )
    ) {
      jackedRight = true;
    }
    if (
      rightToe > INVALID_COLUMN
      && initialState.combinedColumns[rightToe] === FOOT.RIGHT_TOE
      && !resultState.isTheFootHolding[FOOT.RIGHT_TOE]
      && (
        (initialState.didTheFootMove[FOOT.RIGHT_HEEL] && !initialState.isTheFootHolding[FOOT.RIGHT_HEEL])
        || (initialState.didTheFootMove[FOOT.RIGHT_TOE] && !initialState.isTheFootHolding[FOOT.RIGHT_TOE])
      )
    ) {
      jackedRight = true;
    }
  }
  return jackedRight;
}

function didDoubleStep(initialState, resultState, rows, rowIndex, movedLeft, jackedLeft, movedRight, jackedRight) {
  const row = rows[rowIndex];
  let doublestepped = false;

  if (
    movedLeft
    && !jackedLeft
    && (
      (initialState.didTheFootMove[FOOT.LEFT_HEEL] && !initialState.isTheFootHolding[FOOT.LEFT_HEEL])
      || (initialState.didTheFootMove[FOOT.LEFT_TOE] && !initialState.isTheFootHolding[FOOT.LEFT_TOE])
    )
  ) {
    doublestepped = true;
  }

  if (
    movedRight
    && !jackedRight
    && (
      (initialState.didTheFootMove[FOOT.RIGHT_HEEL] && !initialState.isTheFootHolding[FOOT.RIGHT_HEEL])
      || (initialState.didTheFootMove[FOOT.RIGHT_TOE] && !initialState.isTheFootHolding[FOOT.RIGHT_TOE])
    )
  ) {
    doublestepped = true;
  }

  if (rowIndex - 1 > -1) {
    const lastRow = rows[rowIndex - 1];
    for (const hold of lastRow.holds) {
      if (hold.type === NOTE_TYPE.EMPTY) continue;
      const endBeat = row.beat;
      const startBeat = lastRow.beat;
      if ((hold.beat + hold.hold_length) > startBeat && (hold.beat + hold.hold_length) < endBeat) {
        doublestepped = false;
      }
      if ((hold.beat + hold.hold_length) >= endBeat) {
        doublestepped = false;
      }
    }
  }
  return doublestepped;
}

function getActionCost(initialState, resultState, rows, rowIndex, elapsedTime, layout) {
  const row = rows[rowIndex];
  const columnCount = row.columnCount;
  let cost = 0;

  let leftHeel = INVALID_COLUMN;
  let leftToe = INVALID_COLUMN;
  let rightHeel = INVALID_COLUMN;
  let rightToe = INVALID_COLUMN;

  for (let i = 0; i < columnCount; i += 1) {
    switch (resultState.columns[i]) {
      case FOOT.LEFT_HEEL:
        leftHeel = i;
        break;
      case FOOT.LEFT_TOE:
        leftToe = i;
        break;
      case FOOT.RIGHT_HEEL:
        rightHeel = i;
        break;
      case FOOT.RIGHT_TOE:
        rightToe = i;
        break;
      default:
        break;
    }
  }

  const movedLeft = resultState.didTheFootMove[FOOT.LEFT_HEEL] || resultState.didTheFootMove[FOOT.LEFT_TOE];
  const movedRight = resultState.didTheFootMove[FOOT.RIGHT_HEEL] || resultState.didTheFootMove[FOOT.RIGHT_TOE];

  const didJump = (
    (
      (initialState.didTheFootMove[FOOT.LEFT_HEEL] && !initialState.isTheFootHolding[FOOT.LEFT_HEEL])
      || (initialState.didTheFootMove[FOOT.LEFT_TOE] && !initialState.isTheFootHolding[FOOT.LEFT_TOE])
    )
    && (
      (initialState.didTheFootMove[FOOT.RIGHT_HEEL] && !initialState.isTheFootHolding[FOOT.RIGHT_HEEL])
      || (initialState.didTheFootMove[FOOT.RIGHT_TOE] && !initialState.isTheFootHolding[FOOT.RIGHT_TOE])
    )
  );

  const jackedLeft = didJackLeft(initialState, resultState, leftHeel, leftToe, movedLeft, didJump);
  const jackedRight = didJackRight(initialState, resultState, rightHeel, rightToe, movedRight, didJump);

  for (let i = 0; i < columnCount; i += 1) {
    if (resultState.combinedColumns[i] !== FOOT.NONE && row.mines[i] !== 0) {
      cost += MINE;
      break;
    }
  }

  for (let c = 0; c < columnCount; c += 1) {
    if (row.holds[c].type === NOTE_TYPE.EMPTY) continue;
    if (
      (
        (resultState.combinedColumns[c] === FOOT.LEFT_HEEL || resultState.combinedColumns[c] === FOOT.LEFT_TOE)
        && initialState.combinedColumns[c] !== FOOT.LEFT_TOE
        && initialState.combinedColumns[c] !== FOOT.LEFT_HEEL
      )
      || (
        (resultState.combinedColumns[c] === FOOT.RIGHT_HEEL || resultState.combinedColumns[c] === FOOT.RIGHT_TOE)
        && initialState.combinedColumns[c] !== FOOT.RIGHT_TOE
        && initialState.combinedColumns[c] !== FOOT.RIGHT_HEEL
      )
    ) {
      const previousFoot = initialState.whereTheFeetAre[resultState.combinedColumns[c]];
      cost += HOLDSWITCH * (
        previousFoot === INVALID_COLUMN
          ? 1
          : Math.sqrt(layout.getDistanceSq(c, previousFoot))
      );
    }
  }

  if (leftHeel !== INVALID_COLUMN && leftToe !== INVALID_COLUMN) {
    let jackPenalty = 1;
    if (initialState.didTheFootMove[FOOT.LEFT_HEEL] || initialState.didTheFootMove[FOOT.LEFT_TOE]) {
      jackPenalty = elapsedTime > 0 ? (1 / elapsedTime) : 1;
    }
    if (row.holds[leftHeel].type !== NOTE_TYPE.EMPTY && row.holds[leftToe].type === NOTE_TYPE.EMPTY) {
      cost += BRACKETTAP * jackPenalty;
    }
    if (row.holds[leftToe].type !== NOTE_TYPE.EMPTY && row.holds[leftHeel].type === NOTE_TYPE.EMPTY) {
      cost += BRACKETTAP * jackPenalty;
    }
  }
  if (rightHeel !== INVALID_COLUMN && rightToe !== INVALID_COLUMN) {
    let jackPenalty = 1;
    if (initialState.didTheFootMove[FOOT.RIGHT_HEEL] || initialState.didTheFootMove[FOOT.RIGHT_TOE]) {
      jackPenalty = elapsedTime > 0 ? (1 / elapsedTime) : 1;
    }
    if (row.holds[rightHeel].type !== NOTE_TYPE.EMPTY && row.holds[rightToe].type === NOTE_TYPE.EMPTY) {
      cost += BRACKETTAP * jackPenalty;
    }
    if (row.holds[rightToe].type !== NOTE_TYPE.EMPTY && row.holds[rightHeel].type === NOTE_TYPE.EMPTY) {
      cost += BRACKETTAP * jackPenalty;
    }
  }

  if (
    (movedLeft !== movedRight)
    && (movedLeft || movedRight)
    && isEmptyFootArray(resultState.holdFeet)
    && !didJump
  ) {
    if (jackedLeft && resultState.didTheFootMove[FOOT.LEFT_HEEL] && resultState.didTheFootMove[FOOT.LEFT_TOE]) {
      cost += BRACKETJACK;
    }
    if (jackedRight && resultState.didTheFootMove[FOOT.RIGHT_HEEL] && resultState.didTheFootMove[FOOT.RIGHT_TOE]) {
      cost += BRACKETJACK;
    }
  }

  if (
    (movedLeft !== movedRight)
    && (movedLeft || movedRight)
    && isEmptyFootArray(resultState.holdFeet)
    && !didJump
  ) {
    if (didDoubleStep(initialState, resultState, rows, rowIndex, movedLeft, jackedLeft, movedRight, jackedRight)) {
      cost += DOUBLESTEP;
    }
  }

  if (elapsedTime > SLOW_BRACKET_THRESHOLD && movedLeft !== movedRight && countActiveNotes(row.notes) >= 2) {
    const timediff = elapsedTime - SLOW_BRACKET_THRESHOLD;
    cost += timediff * SLOW_BRACKET;
  }

  {
    const lHeel = resultState.whatNoteTheFootIsHitting[FOOT.LEFT_HEEL];
    const lToe = resultState.whatNoteTheFootIsHitting[FOOT.LEFT_TOE];
    const rHeel = resultState.whatNoteTheFootIsHitting[FOOT.RIGHT_HEEL];
    const rToe = resultState.whatNoteTheFootIsHitting[FOOT.RIGHT_TOE];
    const leftPos = layout.averagePoint(lHeel, lToe);
    const rightPos = layout.averagePoint(rHeel, rToe);
    const crossedOver = rightPos.x < leftPos.x;
    const rightBackwards = rHeel !== INVALID_COLUMN && rToe !== INVALID_COLUMN ? layout.columns[rToe].y < layout.columns[rHeel].y : false;
    const leftBackwards = lHeel !== INVALID_COLUMN && lToe !== INVALID_COLUMN ? layout.columns[lToe].y < layout.columns[lHeel].y : false;
    if (!crossedOver && (rightBackwards || leftBackwards)) {
      cost += TWISTED_FOOT;
    }
  }

  // Facing penalties
  {
    let endLeftHeel = INVALID_COLUMN;
    let endLeftToe = INVALID_COLUMN;
    let endRightHeel = INVALID_COLUMN;
    let endRightToe = INVALID_COLUMN;
    for (let i = 0; i < columnCount; i += 1) {
      switch (resultState.combinedColumns[i]) {
        case FOOT.LEFT_HEEL:
          endLeftHeel = i;
          break;
        case FOOT.LEFT_TOE:
          endLeftToe = i;
          break;
        case FOOT.RIGHT_HEEL:
          endRightHeel = i;
          break;
        case FOOT.RIGHT_TOE:
          endRightToe = i;
          break;
        default:
          break;
      }
    }
    if (endLeftToe === INVALID_COLUMN) endLeftToe = endLeftHeel;
    if (endRightToe === INVALID_COLUMN) endRightToe = endRightHeel;

    const heelFacing = endLeftHeel !== INVALID_COLUMN && endRightHeel !== INVALID_COLUMN
      ? layout.getXDifference(endLeftHeel, endRightHeel)
      : 0;
    const toeFacing = endLeftToe !== INVALID_COLUMN && endRightToe !== INVALID_COLUMN
      ? layout.getXDifference(endLeftToe, endRightToe)
      : 0;
    const leftFacing = endLeftHeel !== INVALID_COLUMN && endLeftToe !== INVALID_COLUMN
      ? layout.getYDifference(endLeftHeel, endLeftToe)
      : 0;
    const rightFacing = endRightHeel !== INVALID_COLUMN && endRightToe !== INVALID_COLUMN
      ? layout.getYDifference(endRightHeel, endRightToe)
      : 0;

    const heelFacingPenalty = Math.pow(-1 * Math.min(heelFacing, 0), 1.8) * 100;
    const toesFacingPenalty = Math.pow(-1 * Math.min(toeFacing, 0), 1.8) * 100;
    const leftFacingPenalty = Math.pow(-1 * Math.min(leftFacing, 0), 1.8) * 100;
    const rightFacingPenalty = Math.pow(-1 * Math.min(rightFacing, 0), 1.8) * 100;

    if (heelFacingPenalty > 0) cost += heelFacingPenalty * FACING;
    if (toesFacingPenalty > 0) cost += toesFacingPenalty * FACING;
    if (leftFacingPenalty > 0) cost += leftFacingPenalty * FACING;
    if (rightFacingPenalty > 0) cost += rightFacingPenalty * FACING;
  }

  // Spin penalties
  {
    let endLeftHeel = INVALID_COLUMN;
    let endLeftToe = INVALID_COLUMN;
    let endRightHeel = INVALID_COLUMN;
    let endRightToe = INVALID_COLUMN;
    for (let i = 0; i < columnCount; i += 1) {
      switch (resultState.combinedColumns[i]) {
        case FOOT.LEFT_HEEL:
          endLeftHeel = i;
          break;
        case FOOT.LEFT_TOE:
          endLeftToe = i;
          break;
        case FOOT.RIGHT_HEEL:
          endRightHeel = i;
          break;
        case FOOT.RIGHT_TOE:
          endRightToe = i;
          break;
        default:
          break;
      }
    }
    if (endLeftToe === INVALID_COLUMN) endLeftToe = endLeftHeel;
    if (endRightToe === INVALID_COLUMN) endRightToe = endRightHeel;

    const previousLeftPos = layout.averagePoint(
      initialState.whereTheFeetAre[FOOT.LEFT_HEEL],
      initialState.whereTheFeetAre[FOOT.LEFT_TOE],
    );
    const previousRightPos = layout.averagePoint(
      initialState.whereTheFeetAre[FOOT.RIGHT_HEEL],
      initialState.whereTheFeetAre[FOOT.RIGHT_TOE],
    );
    const leftPos = layout.averagePoint(endLeftHeel, endLeftToe);
    const rightPos = layout.averagePoint(endRightHeel, endRightToe);

    if (
      rightPos.x < leftPos.x
      && previousRightPos.x < previousLeftPos.x
      && rightPos.y < leftPos.y
      && previousRightPos.y > previousLeftPos.y
    ) {
      cost += SPIN;
    }
    if (
      rightPos.x < leftPos.x
      && previousRightPos.x < previousLeftPos.x
      && rightPos.y > leftPos.y
      && previousRightPos.y < previousLeftPos.y
    ) {
      cost += SPIN;
    }
  }

  if (elapsedTime >= SLOW_FOOTSWITCH_THRESHOLD && elapsedTime < SLOW_FOOTSWITCH_IGNORE) {
    const hasAnyMine = row.mines.some((mine) => mine !== 0) || row.fakeMines.some((mine) => mine !== 0);
    if (!hasAnyMine) {
      const timeScaled = elapsedTime - SLOW_FOOTSWITCH_THRESHOLD;
      for (let i = 0; i < columnCount; i += 1) {
        if (initialState.combinedColumns[i] === FOOT.NONE || resultState.columns[i] === FOOT.NONE) continue;
        if (
          initialState.combinedColumns[i] !== resultState.columns[i]
          && initialState.combinedColumns[i] !== OTHER_PART_OF_FOOT[resultState.columns[i]]
        ) {
          cost += (timeScaled / (SLOW_FOOTSWITCH_THRESHOLD + timeScaled)) * FOOTSWITCH;
          break;
        }
      }
    }
  }

  for (const c of layout.sideArrows) {
    if (
      initialState.combinedColumns[c] !== resultState.columns[c]
      && resultState.columns[c] !== FOOT.NONE
      && initialState.combinedColumns[c] !== FOOT.NONE
      && !resultState.didTheFootMove[initialState.combinedColumns[c]]
    ) {
      cost += SIDESWITCH;
    }
  }

  if ((jackedLeft || jackedRight) && (row.mines.some((mine) => mine !== 0) || row.fakeMines.some((mine) => mine !== 0))) {
    cost += MISSED_FOOTSWITCH;
  }

  if (elapsedTime < JACK_THRESHOLD && movedLeft !== movedRight) {
    const timeScaled = JACK_THRESHOLD - elapsedTime;
    if ((jackedLeft || jackedRight) && timeScaled > 0) {
      cost += ((1 / timeScaled) - (1 / JACK_THRESHOLD)) * JACK;
    }
  }

  for (const foot of resultState.movedFeet) {
    if (foot === FOOT.NONE) continue;
    const initialPosition = initialState.whereTheFeetAre[foot];
    if (initialPosition === INVALID_COLUMN) continue;
    const resultPosition = resultState.whatNoteTheFootIsHitting[foot];
    const otherPart = OTHER_PART_OF_FOOT[foot];
    const isBracketing = resultState.whatNoteTheFootIsHitting[otherPart] !== INVALID_COLUMN;
    if (isBracketing && resultState.whatNoteTheFootIsHitting[otherPart] === initialPosition) continue;
    if (elapsedTime <= 0) continue;
    let dist = (Math.sqrt(layout.getDistanceSq(initialPosition, resultPosition)) * DISTANCE) / elapsedTime;
    if (isBracketing) dist *= 0.2;
    cost += dist;
  }

  cost += FACING * 0; // placeholder to mirror deterministic numeric behavior
  cost += OTHER;
  return cost;
}

function analyzeRowsWithStepParity(rows, layout) {
  if (!Array.isArray(rows) || rows.length === 0) return false;

  const stateCache = new Map();
  const nodes = [];
  const permuteCache = new Map();

  const addNode = (state, second, rowIndex) => {
    const node = { id: nodes.length, state, second, rowIndex, neighbors: new Map() };
    nodes.push(node);
    return node;
  };

  const addEdge = (fromNode, toNode, cost) => {
    fromNode.neighbors.set(toNode.id, cost);
  };

  const getFootPlacementPermutations = (row) => {
    const cacheKey = getPermuteCacheKey(row);
    if (!permuteCache.has(cacheKey)) {
      const blank = new Array(row.columnCount).fill(FOOT.NONE);
      let computed = permuteFootPlacements(row, layout, blank, 0, false);
      if (computed.length === 0) computed = permuteFootPlacements(row, layout, blank, 0, true);
      if (computed.length === 0) computed = [blank];
      permuteCache.set(cacheKey, computed);
    }
    return permuteCache.get(cacheKey);
  };

  const startState = createState(rows[0].columnCount);
  const startNode = addNode(startState, rows[0].second - 1, -1);
  let previousNodes = [startNode];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const resultNodes = [];
    const permutations = getFootPlacementPermutations(row);

    for (const initialNode of previousNodes) {
      const elapsedTime = row.second - initialNode.second;
      for (const placement of permutations) {
        const resultState = initResultState(initialNode.state, row, placement, stateCache);
        const cost = getActionCost(initialNode.state, resultState, rows, i, elapsedTime, layout);

        let existing = null;
        for (const candidate of resultNodes) {
          if (candidate.state === resultState) {
            existing = candidate;
            break;
          }
        }

        if (existing) {
          addEdge(initialNode, existing, cost);
        } else {
          const node = addNode(resultState, row.second, row.rowIndex);
          addEdge(initialNode, node, cost);
          resultNodes.push(node);
        }
      }
    }

    previousNodes = resultNodes;
    if (previousNodes.length === 0) return false;
  }

  const endState = createState(rows[rows.length - 1].columnCount);
  const endNode = addNode(endState, rows[rows.length - 1].second + 1, rows.length);
  for (const node of previousNodes) {
    addEdge(node, endNode, 0);
  }

  const start = startNode.id;
  const end = endNode.id;
  const costs = new Array(nodes.length).fill(Number.POSITIVE_INFINITY);
  const predecessor = new Array(nodes.length).fill(-1);
  costs[start] = 0;

  for (let i = start; i <= end; i += 1) {
    const node = nodes[i];
    const fromCost = costs[i];
    if (!Number.isFinite(fromCost)) continue;
    for (const [neighborId, weight] of node.neighbors.entries()) {
      const nextCost = fromCost + weight;
      if (nextCost < costs[neighborId]) {
        costs[neighborId] = nextCost;
        predecessor[neighborId] = i;
      }
    }
  }

  const nodeIdsForRows = [];
  let current = end;
  while (current !== start) {
    if (current === -1) return false;
    if (current !== end) nodeIdsForRows.push(current);
    current = predecessor[current];
  }
  nodeIdsForRows.reverse();
  if (nodeIdsForRows.length !== rows.length) return false;

  for (let i = 0; i < rows.length; i += 1) {
    const node = nodes[nodeIdsForRows[i]];
    setRowFootPlacement(rows[i], node.state.combinedColumns);
  }
  return true;
}

function isFootswitch(column, currentRow, previousRow, elapsedTime) {
  if (currentRow.columns[column] === FOOT.NONE || previousRow.columns[column] === FOOT.NONE) {
    return false;
  }
  if (
    previousRow.columns[column] !== currentRow.columns[column]
    && OTHER_PART_OF_FOOT[previousRow.columns[column]] !== currentRow.columns[column]
    && elapsedTime < FOOTSWITCH_CUTOFF
  ) {
    return true;
  }
  return false;
}

function calculateTechCountsFromRows(rows, layout) {
  const out = {
    crossovers: 0,
    halfCrossovers: 0,
    fullCrossovers: 0,
    footswitches: 0,
    upFootswitches: 0,
    downFootswitches: 0,
    sideswitches: 0,
    jacks: 0,
    brackets: 0,
    doublesteps: 0,
  };

  for (let i = 1; i < rows.length; i += 1) {
    const currentRow = rows[i];
    const previousRow = rows[i - 1];
    const elapsedTime = currentRow.second - previousRow.second;

    if (currentRow.noteCount === 1 && previousRow.noteCount === 1) {
      for (const foot of FEET) {
        if (
          currentRow.whereTheFeetAre[foot] === INVALID_COLUMN
          || previousRow.whereTheFeetAre[foot] === INVALID_COLUMN
        ) continue;

        if (previousRow.whereTheFeetAre[foot] === currentRow.whereTheFeetAre[foot]) {
          if (elapsedTime < JACK_CUTOFF) out.jacks += 1;
        } else if (elapsedTime < DOUBLESTEP_CUTOFF) {
          out.doublesteps += 1;
        }
      }
    }

    if (currentRow.noteCount >= 2) {
      if (
        currentRow.whereTheFeetAre[FOOT.LEFT_HEEL] !== INVALID_COLUMN
        && currentRow.whereTheFeetAre[FOOT.LEFT_TOE] !== INVALID_COLUMN
      ) {
        out.brackets += 1;
      }
      if (
        currentRow.whereTheFeetAre[FOOT.RIGHT_HEEL] !== INVALID_COLUMN
        && currentRow.whereTheFeetAre[FOOT.RIGHT_TOE] !== INVALID_COLUMN
      ) {
        out.brackets += 1;
      }
    }

    for (const c of layout.upArrows) {
      if (isFootswitch(c, currentRow, previousRow, elapsedTime)) {
        out.upFootswitches += 1;
        out.footswitches += 1;
      }
    }
    for (const c of layout.downArrows) {
      if (isFootswitch(c, currentRow, previousRow, elapsedTime)) {
        out.downFootswitches += 1;
        out.footswitches += 1;
      }
    }
    for (const c of layout.sideArrows) {
      if (isFootswitch(c, currentRow, previousRow, elapsedTime)) {
        out.sideswitches += 1;
      }
    }

    const leftHeel = currentRow.whereTheFeetAre[FOOT.LEFT_HEEL];
    const leftToe = currentRow.whereTheFeetAre[FOOT.LEFT_TOE];
    const rightHeel = currentRow.whereTheFeetAre[FOOT.RIGHT_HEEL];
    const rightToe = currentRow.whereTheFeetAre[FOOT.RIGHT_TOE];
    const previousLeftHeel = previousRow.whereTheFeetAre[FOOT.LEFT_HEEL];
    const previousLeftToe = previousRow.whereTheFeetAre[FOOT.LEFT_TOE];
    const previousRightHeel = previousRow.whereTheFeetAre[FOOT.RIGHT_HEEL];
    const previousRightToe = previousRow.whereTheFeetAre[FOOT.RIGHT_TOE];

    if (
      rightHeel !== INVALID_COLUMN
      && previousLeftHeel !== INVALID_COLUMN
      && previousRightHeel === INVALID_COLUMN
    ) {
      const leftPos = layout.averagePoint(previousLeftHeel, previousLeftToe);
      const rightPos = layout.averagePoint(rightHeel, rightToe);
      if (rightPos.x < leftPos.x) {
        if (i > 1) {
          const prevPrev = rows[i - 2];
          const prevPrevRightHeel = prevPrev.whereTheFeetAre[FOOT.RIGHT_HEEL];
          if (prevPrevRightHeel !== INVALID_COLUMN && prevPrevRightHeel !== rightHeel) {
            const prevPrevRightPos = layout.columns[prevPrevRightHeel];
            if (prevPrevRightPos.x > leftPos.x) out.fullCrossovers += 1;
            else out.halfCrossovers += 1;
            out.crossovers += 1;
          }
        } else {
          out.halfCrossovers += 1;
          out.crossovers += 1;
        }
      }
    } else if (
      leftHeel !== INVALID_COLUMN
      && previousRightHeel !== INVALID_COLUMN
      && previousLeftHeel === INVALID_COLUMN
    ) {
      const leftPos = layout.averagePoint(leftHeel, leftToe);
      const rightPos = layout.averagePoint(previousRightHeel, previousRightToe);
      if (rightPos.x < leftPos.x) {
        if (i > 1) {
          const prevPrev = rows[i - 2];
          const prevPrevLeftHeel = prevPrev.whereTheFeetAre[FOOT.LEFT_HEEL];
          if (prevPrevLeftHeel !== INVALID_COLUMN && prevPrevLeftHeel !== leftHeel) {
            const prevPrevLeftPos = layout.columns[prevPrevLeftHeel];
            if (rightPos.x > prevPrevLeftPos.x) out.fullCrossovers += 1;
            else out.halfCrossovers += 1;
            out.crossovers += 1;
          }
        } else {
          out.halfCrossovers += 1;
          out.crossovers += 1;
        }
      }
    }
  }

  return out;
}

function detectLaneCount(chart) {
  const fromArrows = Array.isArray(chart?.arrows)
    ? chart.arrows.map((a) => String(a?.direction || '').length)
    : [];
  const maxArrow = fromArrows.length > 0 ? Math.max(...fromArrows) : 0;
  if (maxArrow >= 8) return 8;
  if (maxArrow >= 4) return 4;

  const notes = typeof chart?.notes === 'string' ? chart.notes : '';
  const lines = notes.replace(/\r\n?/g, '\n').split('\n');
  let maxLine = 0;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line || line.startsWith(',') || line.startsWith(';') || line.startsWith('#') || line.includes(':')) continue;
    maxLine = Math.max(maxLine, line.length);
  }
  if (maxLine >= 8) return 8;
  if (maxLine >= 4) return 4;
  return 0;
}

export function computeItgmaniaTechCounts(chart) {
  const laneCount = detectLaneCount(chart);
  const layout = getLayout(laneCount);
  if (!layout) return null;

  const rows = buildRowsFromChart(chart, laneCount);
  if (rows.length === 0) {
    return {
      crossovers: 0,
      halfCrossovers: 0,
      fullCrossovers: 0,
      footswitches: 0,
      upFootswitches: 0,
      downFootswitches: 0,
      sideswitches: 0,
      jacks: 0,
      brackets: 0,
      doublesteps: 0,
      footworkMethod: 'itgmania-step-parity-v1',
    };
  }

  const ok = analyzeRowsWithStepParity(rows, layout);
  if (!ok) return null;
  return {
    ...calculateTechCountsFromRows(rows, layout),
    footworkMethod: 'itgmania-step-parity-v1',
  };
}
