import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseSm } from '../src/utils/smParser.js'
import { loadSongIdMap } from './songIdUtils.mjs'
import { buildChartId } from '../src/utils/chartIds.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const SM_FILES_PATH = path.join(PUBLIC_DIR, 'sm-files.json')
const OUTPUT_PATH = path.join(PUBLIC_DIR, 'radar-values.json')
const SONG_LENGTHS_PATH = path.join(PUBLIC_DIR, 'song-lengths.json')
const AUDIO_MAP_PATH = path.join(ROOT, '.local', 'audio-lengths.json')

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

function computeAverageBpm(chart, secOverride) {
  const beats = lastBeatForChart(chart)
  const sec = secOverride != null ? Math.max(0.001, secOverride) : (computeSongSeconds(chart) || 1)
  const avgBpm = (60 * beats) / sec
  return { beats, sec, avgBpm }
}

function expandNoteRows(notesText, mode) {
  const ROWS_PER_MEASURE = 192
  const measures = (notesText || '').split(',')
  const rows = []
  for (const measure of measures) {
    const lines = measure.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) continue
    const sanitized = lines.map(l => l.replace(/F/g, '0'))
    const firstRow = sanitized[0]
    const emptyRow = firstRow.replace(/[0-9MLFAKNHGOETU]/g, '0')
    const repeat = Math.max(1, Math.floor(ROWS_PER_MEASURE / sanitized.length))
    const expanded = []
    for (const r of sanitized) {
      expanded.push(r)
      for (let i = 0; i < repeat - 1; i++) expanded.push(emptyRow)
    }
    if (expanded.length < ROWS_PER_MEASURE) {
      while (expanded.length < ROWS_PER_MEASURE) expanded.push(emptyRow)
    } else if (expanded.length > ROWS_PER_MEASURE) {
      expanded.length = ROWS_PER_MEASURE
    }
    rows.push(...expanded)
  }
  return rows
}

function computeVoltage(chart, mode, notesText, secOverride) {
  const { avgBpm } = computeAverageBpm(chart, secOverride)
  const rows = expandNoteRows(notesText, mode)
  const perRow = rows.map(r => {
    let cnt = 0
    let shocks = 0
    for (const ch of r) {
      if (ch === '1' || ch === '2' || ch === '4') cnt++
      if (ch === 'M') shocks++
    }
    return cnt + shocks
  })
  // Beat-aligned 4-beat windows (start at multiples of 48 rows)
  const window = 192
  let maxSum = 0
  for (let start = 0; start + window <= perRow.length; start += 48) {
    let sum = 0
    for (let i = start; i < start + window; i++) sum += perRow[i]
    if (sum > maxSum) maxSum = sum
  }
  const avgPeakDensity = Math.floor((avgBpm * maxSum) / 4)
  let voltage
  if (avgPeakDensity <= 600) voltage = Math.floor(avgPeakDensity / 6)
  else voltage = Math.floor(((avgPeakDensity + 594) * 100) / 1194)
  return { value: voltage, peakNotes4Beats: maxSum, avgPeakDensity }
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

function computeChaos(chart, mode, songSec, notesText) {
  const ROWS_PER_MEASURE = 192
  const ROWS_PER_BEAT = 48
  if (!chart || !Array.isArray(chart.arrows) || !songSec) return { value: 0 }

  // Collapse events by exact row (1/192 of a measure)
  const rowMap = new Map()
  for (const ev of chart.arrows) {
    const row = Math.round((ev.offset || 0) * ROWS_PER_MEASURE)
    let taps = 0
    let shockLanes = 0
    const dir = ev.direction || ''
    for (const ch of dir) {
      if (ch === '1' || ch === '2' || ch === '4') taps++
      if (ch === 'M') shockLanes++
    }
    const prev = rowMap.get(row) || { taps: 0, shockLanes: 0 }
    rowMap.set(row, { taps: prev.taps + taps, shockLanes: prev.shockLanes + shockLanes })
  }
  const noteRowIdx = [...rowMap.keys()].sort((a, b) => a - b)
  if (noteRowIdx.length < 2) return { value: 0 }

  // IBV: sum over non-red notes of (arrows × color / interval_in_beats)
  let ibv = 0
  for (let i = 1; i < noteRowIdx.length; i++) {
    const cur = noteRowIdx[i]
    const prev = noteRowIdx[i - 1]
    const intervalBeats = Math.max(1e-6, (cur - prev) / ROWS_PER_BEAT)
    const curBeat = cur / ROWS_PER_BEAT
    const denom = quantDenomForBeat(curBeat)
    // Red=0, Blue=2, Yellow=4, Green=5
    const color = (denom === 4 ? 0 : denom === 8 ? 2 : denom === 16 ? 4 : 5)
    if (color <= 0) continue
    const { taps, shockLanes } = rowMap.get(cur)
    const arrows = shockLanes > 0 ? (mode === 'double' ? 8 : 4) : (taps >= 2 ? 2 : (taps >= 1 ? 1 : 0))
    ibv += (arrows * color) / intervalBeats
  }

  // f = sum of absolute BPM jumps + BPM-after-stop for each stop
  const bpmRanges = Array.isArray(chart.bpm) ? chart.bpm : []
  let jumpSum = 0
  for (let i = 1; i < bpmRanges.length; i++) {
    const a = bpmRanges[i - 1]?.bpm || 0
    const b = bpmRanges[i]?.bpm || 0
    jumpSum += Math.abs(b - a)
  }
  let stopSum = 0
  for (const s of (chart.stops || [])) {
    const pos = (s.offset ?? 0) + 1e-9
    let after = 0
    for (const seg of bpmRanges) {
      if ((seg.startOffset ?? 0) <= pos && (seg.endOffset == null || seg.endOffset > pos)) { after = seg.bpm || 0; break }
      if ((seg.startOffset ?? 0) <= pos) after = seg.bpm || after
    }
    stopSum += after
  }
  const f = jumpSum + stopSum
  const x = (60 * f) / songSec

  // s, u, and Chaos mapping
  const s = ibv * (1 + x / 1500)
  const unitChaos = Math.round((100 * s) / songSec)
  let chaos
  if (unitChaos <= 2000) chaos = Math.floor(unitChaos / 20)
  else chaos = Math.floor(((unitChaos + (mode === 'single' ? 21605 : 16628)) * 100) / (mode === 'single' ? 23605 : 18628))
  return { value: chaos, unitChaos, avgBpmDelta: Math.floor(x) }
}

async function main() {
  try {
    const smListRaw = await fs.readFile(SM_FILES_PATH, 'utf-8')
    const smList = JSON.parse(smListRaw)
    const songIdMap = await loadSongIdMap()
    let audioMap = {}
    try {
      const audioRaw = await fs.readFile(AUDIO_MAP_PATH, 'utf-8')
      audioMap = JSON.parse(audioRaw)
      console.log(`Loaded audio lengths from ${AUDIO_MAP_PATH}`)
    } catch {}
    const out = {}
    const lengthsOut = {}
    for (const file of smList.files) {
      const full = path.join(PUBLIC_DIR, file.path)
      let text
      try {
        text = await fs.readFile(full, 'utf-8')
      } catch {
        continue
      }
      // Parse optional OFFSET tag from raw text
      let offsetSec = 0
      const mOff = text.match(/#OFFSET:([^;]+);/i)
      if (mOff) {
        const v = Number(mOff[1])
        if (!Number.isNaN(v)) offsetSec = v
      }
      // Always use the public/sm simfile for calculations (audio lengths still come from ddrbits)
      let sim
      try { sim = parseSm(text) } catch (e) { console.warn('Failed to parse', file.path); continue }
      for (const at of sim.availableTypes) {
        const chart = sim.charts[at.slug]
        if (!chart) continue
        const computedSec = computeSongSeconds(chart) || 0
        const override = audioMap[file.path]?.lengthSeconds
        const secUsed = override && override > 0 ? override : computedSec
        // Store per-simfile length (seconds + rounded) for deployment
        if (!lengthsOut[file.path]) {
          lengthsOut[file.path] = { seconds: toFixed(secUsed, 3), roundedSeconds: Math.round(secUsed) }
        } else {
          // Keep the max if multiple charts iterate same simfile (should be identical)
          const prev = lengthsOut[file.path]
          if ((secUsed || 0) > (prev.seconds || 0)) {
            lengthsOut[file.path] = { seconds: toFixed(secUsed, 3), roundedSeconds: Math.round(secUsed) }
          }
        }
        const { beats } = computeAverageBpm(chart, secUsed)
        const stream = computeStream(at.mode, chart.arrows, chart.bpm, chart.stops, secUsed)
        const voltage = computeVoltage(chart, at.mode, chart.notes || '', secUsed)
        const air = computeAir(at.mode, chart.arrows, secUsed)
        const freeze = computeFreeze(chart, at.mode)
        const chaos = computeChaos(chart, at.mode, secUsed, chart.notes || '')
        const firstSecBeats = (chart.arrows && chart.arrows.length) ? timeAtOffset(chart.bpm || [], chart.stops || [], chart.arrows[0].offset) : 0
        const firstSec = Math.max(0, firstSecBeats + offsetSec)
        const steps = stream.steps
        const songId = songIdMap[file.path]
        if (!songId) {
          console.warn(`Missing song ID for ${file.path}`)
          continue
        }
        const chartId = buildChartId(songId, at.mode, at.difficulty)
        if (!chartId) continue
        out[chartId] = {
          steps,
          firstNoteSeconds: toFixed(firstSec, 3),
          songSeconds: toFixed(secUsed, 3),
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
    await fs.writeFile(SONG_LENGTHS_PATH, JSON.stringify(lengthsOut))
    console.log(`Wrote ${OUTPUT_PATH} with ${Object.keys(out).length} entries`)
    console.log(`Wrote ${SONG_LENGTHS_PATH} with ${Object.keys(lengthsOut).length} song length entries`)
  } catch (e) {
    console.error('Error generating radar values:', e)
    process.exit(1)
  }
}

main()
