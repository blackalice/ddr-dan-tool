import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseSm } from '../src/utils/smParser.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const SM_FILES_PATH = path.join(PUBLIC_DIR, 'sm-files.json')
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'radar-values.json')

const toFixed = (n, d = 2) => Number.isFinite(n) ? Number(n.toFixed(d)) : 0

function countNotesInRow(dir) {
  let taps = 0
  let shocks = 0
  for (let i = 0; i < dir.length; i++) {
    const c = dir[i]
    if (c === '1' || c === '2' || c === '4') taps += 1
    if (c === 'M') shocks = 1 // treat shock event as 1 for STREAM/AIR counts
  }
  return { taps, shocks }
}

function timeAtOffset(bpmRanges, stops, targetOffset) {
  if (!Array.isArray(bpmRanges) || bpmRanges.length === 0) return 0
  const sorted = [...bpmRanges].sort((a, b) => (a.startOffset ?? 0) - (b.startOffset ?? 0))
  let time = 0
  let pos = sorted[0].startOffset ?? 0
  const stopList = Array.isArray(stops) ? stops : []

  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i]
    const start = Math.max(pos, seg.startOffset ?? pos)
    const end = Math.min(targetOffset, seg.endOffset ?? targetOffset)
    if (end <= start) {
      if ((seg.endOffset ?? Infinity) > targetOffset) break
      pos = seg.endOffset ?? pos
      continue
    }
    const measures = end - start
    const beats = measures * 4
    if (seg.bpm > 0) time += (beats / seg.bpm) * 60
    for (const s of stopList) {
      if (s.offset >= start && s.offset < end) time += (s.duration || 0)
    }
    pos = end
    if (pos >= targetOffset) break
  }
  return time
}

function lastBeatForChart(chart) {
  if (!chart) return 0
  const lastArrowOffset = chart.arrows?.length > 0 ? chart.arrows[chart.arrows.length - 1].offset + 0.25 : 0
  const lastFreezeOffset = chart.freezes?.length > 0 ? chart.freezes[chart.freezes.length - 1].endOffset : 0
  return Math.max(lastArrowOffset, lastFreezeOffset) * 4 // beats
}

function computeSongSeconds(chart) {
  const lastBeat = lastBeatForChart(chart)
  const endOffset = lastBeat / 4
  return timeAtOffset(chart.bpm || [], chart.stops || [], endOffset)
}

function computeStream(mode, arrows, bpm, stops, songSec) {
  let steps = 0
  let shockEvents = 0
  for (const a of arrows || []) {
    const { taps, shocks } = countNotesInRow(a.direction || '')
    steps += taps
    shockEvents += shocks
  }
  const density = Math.floor((60 * (steps + shockEvents)) / (songSec || 1))
  let stream
  if (density <= 300) {
    stream = Math.floor(density / 3)
  } else {
    if (mode === 'single') {
      stream = Math.floor(((density - 139) * 100) / 161)
    } else {
      stream = Math.floor(((density - 183) * 100) / 117)
    }
  }
  return { value: stream, steps, shockEvents, density }
}

function computeAir(mode, arrows, songSec) {
  let jumps = 0
  let shocks = 0
  for (const a of arrows || []) {
    const { taps, shocks: s } = countNotesInRow(a.direction || '')
    if (taps >= 2) jumps += 1
    if (s) shocks += 1
  }
  const density = Math.floor((60 * (jumps + shocks)) / (songSec || 1))
  let air
  if (density <= 55) {
    air = Math.floor((density * 20) / 11)
  } else {
    if (mode === 'single') {
      air = Math.floor(((density + 36) * 100) / 91)
    } else {
      air = Math.floor(((density + 35) * 10) / 9)
    }
  }
  return { value: air, jumps, shocks, density }
}

function computeAverageBpm(chart) {
  const beats = lastBeatForChart(chart)
  const sec = computeSongSeconds(chart) || 1
  const avgBpm = (60 * beats) / sec
  return { beats, sec, avgBpm }
}

function computeVoltage(chart, mode) {
  const { avgBpm } = computeAverageBpm(chart)
  // Peak Density: max notes (taps+hold/roll heads), counting shock rows as per-lane notes
  const evts = (chart.arrows || []).map(a => ({ beat: (a.offset || 0) * 4, dir: a.direction || '' }))
  // Precompute per-event notes count: taps (1/2/4) + shock panel count (M)
  const perEvtNotes = evts.map(e => {
    let cnt = 0
    let shockPanels = 0
    for (const ch of e.dir) {
      if (ch === '1' || ch === '2' || ch === '4') cnt += 1
      if (ch === 'M') shockPanels += 1
    }
    return cnt + shockPanels
  })
  let maxIn4Beats = 0
  let j = 0
  for (let i = 0; i < evts.length; i++) {
    const startBeat = evts[i].beat
    while (j < evts.length && evts[j].beat <= startBeat + 4 + 1e-6) j++
    let sum = 0
    for (let k = i; k < j; k++) sum += perEvtNotes[k]
    if (sum > maxIn4Beats) maxIn4Beats = sum
  }
  const avgPeakDensity = Math.floor((avgBpm * maxIn4Beats) / 4)
  let voltage
  if (avgPeakDensity <= 600) {
    voltage = Math.floor(avgPeakDensity / 6)
  } else {
    voltage = Math.floor(((avgPeakDensity + 594) * 100) / 1194)
  }
  return { value: voltage, peakNotes4Beats: maxIn4Beats, avgPeakDensity }
}

function computeFreeze(chart, mode) {
  // Group freezes by identical start and keep the longest end for that group
  const groups = new Map()
  for (const f of chart.freezes || []) {
    const start = toFixed(f.startOffset || 0, 6)
    const end = f.endOffset || f.startOffset || 0
    const prev = groups.get(start)
    if (!prev || end > prev) groups.set(start, end)
  }
  let totalBeats = 0
  for (const [start, end] of groups.entries()) {
    totalBeats += (end - Number(start)) * 4
  }
  const beatsTotal = lastBeatForChart(chart) || 1
  const faRate = (10000 * totalBeats) / beatsTotal
  let freeze
  if (faRate <= 3500) {
    freeze = Math.floor(faRate / 35)
  } else {
    if (mode === 'single') {
      freeze = Math.floor(((faRate + 2484) * 100) / 5984)
    } else {
      freeze = Math.floor(((faRate + 2246) * 100) / 5746)
    }
  }
  return { value: freeze, faBeats: totalBeats, faRate: Math.floor(faRate) }
}

function quantDenomForBeat(beat) {
  const dens = [4, 8, 12, 16, 24, 32, 48, 64]
  for (const d of dens) {
    const v = beat * d
    if (Math.abs(v - Math.round(v)) < 1e-6) return d
  }
  return 64
}

function colorValueForDenom(d) {
  if (d === 4) return 0
  if (d === 8) return 0.5
  if (d === 16) return 1
  return 1.25 // 12th/24th/32nd/48th/64th etc
}

function computeChaos(chart, mode, songSec) {
  const evts = (chart.arrows || []).map(a => ({ beat: (a.offset || 0) * 4, dir: a.direction || '' }))
  if (evts.length === 0 || !songSec) return { value: 0 }
  let base = 0
  for (let i = 0; i < evts.length; i++) {
    if (i === 0) continue
    const cur = evts[i]
    const prev = evts[i - 1]
    const deltaBeats = Math.max(1e-6, cur.beat - prev.beat)
    const denom = quantDenomForBeat(cur.beat)
    const colorVal = colorValueForDenom(denom)
    // number of arrows on this row including shocks
    let taps = 0
    let shockPanels = 0
    for (const ch of cur.dir) {
      if (ch === '1' || ch === '2' || ch === '4') taps += 1
      if (ch === 'M') shockPanels += 1
    }
    let numArrows = 0
    if (shockPanels > 0) {
      const baseShock = mode === 'single' ? 4 : 8
      const tapCount = taps >= 2 ? 2 : (taps >= 1 ? 1 : 0)
      numArrows = baseShock + tapCount
    } else {
      numArrows = taps >= 2 ? 2 : (taps >= 1 ? 1 : 0)
    }
    base += (denom / deltaBeats) * colorVal * numArrows
  }

  // Total BPM delta: sum of absolute diffs between successive bpm values
  let totalBpmDelta = 0
  const bpmRanges = Array.isArray(chart.bpm) ? chart.bpm : []
  for (let i = 1; i < bpmRanges.length; i++) {
    const diff = Math.abs((bpmRanges[i]?.bpm || 0) - (bpmRanges[i - 1]?.bpm || 0))
    totalBpmDelta += diff
  }
  const avgBpmDelta = (60 * totalBpmDelta) / songSec
  const chaosDegree = base * (1 + (avgBpmDelta / 1500))
  const unitChaos = Math.floor((chaosDegree * 100) / songSec)
  let chaos
  if (unitChaos <= 2000) {
    chaos = Math.floor(unitChaos / 20)
  } else {
    if (mode === 'single') {
      chaos = Math.floor(((unitChaos + 21605) * 100) / 23605)
    } else {
      chaos = Math.floor(((unitChaos + 16628) * 100) / 18628)
    }
  }
  return { value: chaos, unitChaos, avgBpmDelta: Math.floor(avgBpmDelta) }
}

function keyFor(title, mode, difficulty) {
  return `${title}||${mode}||${difficulty}`
}

async function main() {
  try {
    const smListRaw = await fs.readFile(SM_FILES_PATH, 'utf-8')
    const smList = JSON.parse(smListRaw)
    const out = {}
    for (const file of smList.files) {
      const full = path.join(PUBLIC_DIR, file.path)
      let text
      try {
        text = await fs.readFile(full, 'utf-8')
      } catch {
        continue
      }
      let sim
      try {
        sim = parseSm(text)
      } catch (e) {
        console.warn('Failed to parse', file.path)
        continue
      }
      for (const at of sim.availableTypes) {
        const chart = sim.charts[at.slug]
        if (!chart) continue
        const sec = computeSongSeconds(chart) || 0
        const { beats } = computeAverageBpm(chart)
        const stream = computeStream(at.mode, chart.arrows, chart.bpm, chart.stops, sec)
        const voltage = computeVoltage(chart, at.mode)
        const air = computeAir(at.mode, chart.arrows, sec)
        const freeze = computeFreeze(chart, at.mode)
        const chaos = computeChaos(chart, at.mode, sec)
        const firstSec = (chart.arrows && chart.arrows.length) ? timeAtOffset(chart.bpm || [], chart.stops || [], chart.arrows[0].offset) : 0
        const steps = stream.steps
        out[keyFor(sim.title, at.mode, at.difficulty)] = {
          steps,
          firstNoteSeconds: toFixed(firstSec, 3),
          songSeconds: toFixed(sec, 3),
          songBeats: Math.round(beats),
          stream: stream.value,
          voltage: voltage.value,
          air: air.value,
          freeze: freeze.value,
          chaos: chaos.value,
        }
      }
    }
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(out))
    console.log(`Wrote ${OUTPUT_PATH} with ${Object.keys(out).length} entries`)
  } catch (e) {
    console.error('Error generating radar values:', e)
    process.exit(1)
  }
}

main()
