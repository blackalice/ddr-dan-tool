// Compute basic chart metrics and approximate DDR groove radar values from parsed chart data

// Helper: count taps in a direction string (SM/SSC row)
function countTapsInRow(dir) {
  // Include taps (1), hold/roll heads (2,4). Exclude mines (M), freeze tail (3), lifts/fakes if present
  let count = 0;
  for (let i = 0; i < dir.length; i++) {
    const c = dir[i];
    if (c === '1' || c === '2' || c === '4') count += 1;
  }
  return count;
}

// Compute time (seconds) from start to a given offset (in measures)
function timeAtOffset(bpmRanges, stops, targetOffset) {
  if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0;
  const sorted = [...bpmRanges].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0));
  let time = 0;
  let pos = sorted[0].startOffset ?? 0;
  const stopList = Array.isArray(stops) ? stops : [];

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const start = Math.max(pos, seg.startOffset ?? pos);
    const end = Math.min(targetOffset, seg.endOffset ?? targetOffset);
    if (end <= start) {
      if ((seg.endOffset ?? Infinity) > targetOffset) break;
      pos = seg.endOffset ?? pos;
      continue;
    }
    const measures = end - start; // measures
    const beats = measures * 4;
    if (seg.bpm > 0) {
      time += (beats / seg.bpm) * 60;
    }
    // Add any stops occurring within this segment
    for (const s of stopList) {
      if (s.offset >= start && s.offset < end) time += (s.duration || 0);
    }
    pos = end;
    if (pos >= targetOffset) break;
  }
  return time;
}

// Compute total song length (seconds)
function songLengthSeconds(bpmRanges, stops, lastBeat) {
  if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0;
  // Convert beats to measures for end
  const endOffset = (Number(lastBeat) || 0) / 4;
  return timeAtOffset(bpmRanges, stops, endOffset);
}

// Compute per-event timestamps (seconds) for each note row
function eventTimes(arrows, bpmRanges, stops) {
  const times = [];
  if (!Array.isArray(arrows)) return times;
  for (const a of arrows) {
    const t = timeAtOffset(bpmRanges, stops, a.offset);
    times.push(t);
  }
  return times;
}

// Approximate groove radar values
function approximateRadar(arrows, freezes, bpmRanges, stops, lastBeat) {
  const totalSteps = (arrows || []).reduce((acc, a) => acc + countTapsInRow(a.direction || ''), 0);
  const jumpEvents = (arrows || []).reduce((acc, a) => acc + (countTapsInRow(a.direction || '') >= 2 ? 1 : 0), 0);
  const times = eventTimes(arrows || [], bpmRanges || [], stops || []);
  const length = songLengthSeconds(bpmRanges || [], stops || [], lastBeat || 0);

  // Stream: average steps per second (approx.)
  const stream = length > 0 ? totalSteps / length : 0;

  // Voltage: maximum events per 1-second window (approx.)
  let voltage = 0;
  let j = 0;
  for (let i = 0; i < times.length; i++) {
    while (j < times.length && times[j] <= times[i] + 1) j++;
    voltage = Math.max(voltage, j - i);
  }

  // Air: ratio of jump events
  const air = times.length > 0 ? jumpEvents / times.length : 0;

  // Freeze: total freeze active time over song length
  let freezeSeconds = 0;
  if (Array.isArray(freezes)) {
    for (const f of freezes) {
      const start = Math.max(0, f.startOffset ?? 0);
      const end = Math.max(start, f.endOffset ?? start);
      freezeSeconds += timeAtOffset(bpmRanges || [], stops || [], end) - timeAtOffset(bpmRanges || [], stops || [], start);
    }
  }
  const freeze = length > 0 ? Math.min(1, freezeSeconds / length) : 0;
  return { stream, voltage, air, freeze, chaos: null };
}

function computeLastBeat(chart) {
  // Mirrors getLastBeat logic used elsewhere
  if (!chart) return 0;
  const lastArrowOffset = chart.arrows?.length > 0 ? chart.arrows[chart.arrows.length - 1].offset + 0.25 : 0;
  const lastFreezeOffset = chart.freezes?.length > 0 ? chart.freezes[chart.freezes.length - 1].endOffset : 0;
  return Math.max(lastArrowOffset, lastFreezeOffset) * 4; // beats
}

export function computeChartMetrics(chart) {
  if (!chart) return null;
  const steps = (chart.arrows || []).reduce((acc, a) => acc + countTapsInRow(a.direction || ''), 0);
  const firstOffset = chart.arrows && chart.arrows.length > 0 ? chart.arrows[0].offset : 0;
  const firstNoteSeconds = timeAtOffset(chart.bpm || [], chart.stops || [], firstOffset);
  const lastBeat = computeLastBeat(chart);
  const radar = approximateRadar(chart.arrows || [], chart.freezes || [], chart.bpm || [], chart.stops || [], lastBeat);
  return { steps, firstNoteSeconds, radar, lastBeat };
}

export { timeAtOffset, songLengthSeconds };
