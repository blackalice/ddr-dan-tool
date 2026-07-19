function toNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function toNonNegativeNumber(value, precision = 3) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const factor = 10 ** precision;
  return Math.round(n * factor) / factor;
}

function putCount(target, key, value) {
  const n = toNonNegativeInt(value);
  if (n === null) return;
  target[key] = n;
}

function putMeasure(target, key, value, precision = 3) {
  const n = toNonNegativeNumber(value, precision);
  if (n === null) return;
  target[key] = n;
}

export function buildCounts(metrics, itgTech) {
  const debugStats = metrics?.debugStats && typeof metrics.debugStats === 'object'
    ? metrics.debugStats
    : {};
  const counts = {};

  // Basic counts
  putCount(counts, 'steps', metrics?.steps);
  putCount(counts, 'notes', metrics?.notes);
  putCount(counts, 'jumps', metrics?.jumps);
  putCount(counts, 'hands', metrics?.hands);
  putCount(counts, 'quads', metrics?.quads);
  putCount(counts, 'holds', metrics?.holds);
  putCount(counts, 'shocks', metrics?.shocks);
  putCount(counts, 'stops', debugStats.stops);

  // Footwork patterns
  putCount(counts, 'crossovers', debugStats.crossovers);
  putCount(counts, 'halfCrossovers', debugStats.halfCrossovers);
  putCount(counts, 'fullCrossovers', debugStats.fullCrossovers);
  putCount(counts, 'holdCrossovers', debugStats.holdCrossovers);
  putCount(counts, 'footswitches', debugStats.footswitches);
  putCount(counts, 'upFootswitches', debugStats.upFootswitches);
  putCount(counts, 'downFootswitches', debugStats.downFootswitches);
  putCount(counts, 'sideswitches', debugStats.sideswitches);
  putCount(counts, 'jacks', debugStats.jacks);
  putCount(counts, 'doublesteps', debugStats.doublesteps);
  putCount(counts, 'brackets', debugStats.brackets);
  putCount(counts, 'forcedBrackets', debugStats.forcedBrackets);

  // Advanced patterns
  putCount(counts, 'anchors', debugStats.anchors);
  putCount(counts, 'spins', debugStats.spins);
  putCount(counts, 'spins180', debugStats.spins180);
  putCount(counts, 'spins360', debugStats.spins360);
  putCount(counts, 'staircases', debugStats.staircases);
  putCount(counts, 'rolls', debugStats.rolls);
  putCount(counts, 'candles', debugStats.candles);
  putCount(counts, 'drills', debugStats.drills);
  putCount(counts, 'drillNotes', debugStats.drillNotes);
  putCount(counts, 'gallops', debugStats.gallops);
  putCount(counts, 'monoRuns', debugStats.monoRuns);
  putCount(counts, 'monoLeftRuns', debugStats.monoLeftRuns);
  putCount(counts, 'monoRightRuns', debugStats.monoRightRuns);
  putCount(counts, 'streams', debugStats.streamCount);
  putCount(counts, 'streamCount', debugStats.streamCount);
  putCount(counts, 'streamNotes', debugStats.streamNotes);
  putCount(counts, 'bursts', debugStats.bursts);
  putCount(counts, 'technicalMoves', debugStats.technicalMoves);

  // Density metrics (float values)
  putMeasure(counts, 'notesPerSecond', debugStats.notesPerSecond, 3);
  putMeasure(counts, 'stepsPerSecond', debugStats.stepsPerSecond, 3);
  putMeasure(counts, 'maximumNotesPerSecond', debugStats.maximumNotesPerSecond, 3);
  putMeasure(counts, 'meanNotesPerSecond', debugStats.meanNotesPerSecond, 3);
  putMeasure(counts, 'medianNotesPerSecond', debugStats.medianNotesPerSecond, 3);
  putMeasure(counts, 'fastest3NoteBurst', debugStats.fastest3NoteBurst, 3);
  putMeasure(counts, 'fastest7NoteRun', debugStats.fastest7NoteRun, 3);
  putMeasure(counts, 'fastest15NoteRun', debugStats.fastest15NoteRun, 3);
  putMeasure(counts, 'maxTimeBetweenNotes', debugStats.maxTimeBetweenNotes, 3);

  // Prefer ITGmania StepParity/TechCounts for overlapping categories.
  if (itgTech && typeof itgTech === 'object') {
    putCount(counts, 'crossovers', itgTech.crossovers);
    putCount(counts, 'halfCrossovers', itgTech.halfCrossovers);
    putCount(counts, 'fullCrossovers', itgTech.fullCrossovers);
    putCount(counts, 'footswitches', itgTech.footswitches);
    putCount(counts, 'upFootswitches', itgTech.upFootswitches);
    putCount(counts, 'downFootswitches', itgTech.downFootswitches);
    putCount(counts, 'sideswitches', itgTech.sideswitches);
    putCount(counts, 'jacks', itgTech.jacks);
    putCount(counts, 'brackets', itgTech.brackets);
    putCount(counts, 'doublesteps', itgTech.doublesteps);
  }

  // ITGmania category aliases for compatibility.
  if (counts.crossovers != null) counts.TechCountsCategory_Crossovers = counts.crossovers;
  if (counts.footswitches != null) counts.TechCountsCategory_Footswitches = counts.footswitches;
  if (counts.sideswitches != null) counts.TechCountsCategory_Sideswitches = counts.sideswitches;
  if (counts.jacks != null) counts.TechCountsCategory_Jacks = counts.jacks;
  if (counts.brackets != null) counts.TechCountsCategory_Brackets = counts.brackets;
  if (counts.doublesteps != null) counts.TechCountsCategory_Doublesteps = counts.doublesteps;

  return Object.keys(counts).length > 0 ? counts : null;
}
