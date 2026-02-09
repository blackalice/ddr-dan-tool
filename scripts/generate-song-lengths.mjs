import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseSm } from '../src/utils/smParser.js'
import {
  collectStats,
  mergeStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const GENERATED_DIR = path.join(DATA_DIR, 'generated')
const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles')
const SM_FILES_PATH = path.join(GENERATED_DIR, 'sm-files.json')
const SONG_LENGTHS_PATH = path.join(GENERATED_DIR, 'song-lengths.json')
const AUDIO_MAP_PATH = path.join(GENERATED_DIR, 'audio-lengths.json')
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'song-lengths.json')
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1'
const MIN_REASONABLE_SONG_SECONDS = 10
const MAX_REASONABLE_SONG_SECONDS = 60 * 60

const toSimfilePath = (publicPath) => {
  const normalized = String(publicPath || '').replace(/\\/g, '/')
  const trimmed = normalized.startsWith('sm/') ? normalized.slice(3) : normalized
  return path.join(SIMFILES_DIR, trimmed)
}

const toFixed = (n, d = 2) => Number.isFinite(n) ? Number(n.toFixed(d)) : 0

function isReasonableSongLength(seconds) {
  const n = Number(seconds)
  return Number.isFinite(n) && n >= MIN_REASONABLE_SONG_SECONDS && n <= MAX_REASONABLE_SONG_SECONDS
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

async function main() {
  try {
    await fs.mkdir(GENERATED_DIR, { recursive: true })
    const inputStats = mergeStats(
      await collectStats([SM_FILES_PATH, AUDIO_MAP_PATH], ROOT),
      await collectStats([path.join(ROOT, 'scripts', 'generate-song-lengths.mjs')], ROOT),
    )
    const { skip, reason } = await shouldSkipBuild({
      cachePath: CACHE_PATH,
      inputStats,
      outputPaths: [SONG_LENGTHS_PATH],
      force: FORCE,
    })
    if (skip) {
      console.log(`[generate-song-lengths] up-to-date (${reason}) — skipping.`)
      return
    }
    const smListRaw = await fs.readFile(SM_FILES_PATH, 'utf-8')
    const smList = JSON.parse(smListRaw)
    let audioMap = {}
    try {
      const audioRaw = await fs.readFile(AUDIO_MAP_PATH, 'utf-8')
      audioMap = JSON.parse(audioRaw)
      console.log(`Loaded audio lengths from ${AUDIO_MAP_PATH}`)
    } catch {}
    const lengthsOut = {}
    for (const file of smList.files) {
      const full = toSimfilePath(file.path)
      let text
      try {
        text = await fs.readFile(full, 'utf-8')
      } catch {
        continue
      }
      // Always use the source simfile for calculations (audio lengths still come from data/generated)
      let sim
      try { sim = parseSm(text) } catch (e) { console.warn('Failed to parse', file.path); continue }
      const override = Number(audioMap[file.path]?.lengthSeconds)
      if (isReasonableSongLength(override)) {
        lengthsOut[file.path] = { seconds: toFixed(override, 3), roundedSeconds: Math.round(override) }
        continue
      }
      if (Number.isFinite(override) && override > 0 && !isReasonableSongLength(override)) {
        console.warn(`Ignoring implausible audio length for ${file.path}: ${override}`)
      }
      for (const at of sim.availableTypes) {
        const chart = sim.charts[at.slug]
        if (!chart) continue
        const rawSec = computeSongSeconds(chart) || 0
        const secUsed = isReasonableSongLength(rawSec) ? rawSec : 0
        if (rawSec > 0 && secUsed === 0) {
          console.warn(`Ignoring implausible computed chart length for ${file.path} (${at.slug}): ${rawSec}`)
        }
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
      }
    }
    await fs.writeFile(SONG_LENGTHS_PATH, JSON.stringify(lengthsOut))
    console.log(`Wrote ${SONG_LENGTHS_PATH} with ${Object.keys(lengthsOut).length} song length entries`)
    await writeCache(CACHE_PATH, inputStats)
  } catch (e) {
    console.error('Error generating song lengths:', e)
    process.exit(1)
  }
}

main()
