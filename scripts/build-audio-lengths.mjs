#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFile } from 'music-metadata'
import { spawn } from 'child_process'
import os from 'os'
import {
  collectStats,
  collectTreeStats,
  mergeStats,
  shouldSkipBuild,
  writeCache,
} from './cache-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const SIMFILES_DIR = path.join(DATA_DIR, 'simfiles')
const GENERATED_DIR = path.join(DATA_DIR, 'generated')
const OUT_PATH = path.join(GENERATED_DIR, 'audio-lengths.json')
const CACHE_PATH = path.join(GENERATED_DIR, '.cache', 'audio-lengths.json')
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1'
const MIN_REASONABLE_AUDIO_SECONDS = 10
const MAX_REASONABLE_AUDIO_SECONDS = 60 * 60

async function* walk(dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const res = path.resolve(dir, d.name)
    if (d.isDirectory()) yield* walk(res)
    else yield res
  }
}

function normalizeName(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function isReasonableAudioSeconds(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= MIN_REASONABLE_AUDIO_SECONDS && n <= MAX_REASONABLE_AUDIO_SECONDS
}

async function indexBits(sourceRoot) {
  const byBase = new Map()      // audio by basename
  const byFolder = new Map()    // audio by folder name (normalized)
  const bySmBase = new Map()    // sm/ssc by base name -> set of folders
  for await (const file of walk(sourceRoot)) {
    const ext = path.extname(file).toLowerCase()
    if (ext === '.ogg' || ext === '.mp3' || ext === '.wav') {
      const base = path.basename(file).toLowerCase()
      if (!byBase.has(base)) byBase.set(base, [])
      byBase.get(base).push(file)
      const folder = normalizeName(path.basename(path.dirname(file)))
      if (!byFolder.has(folder)) byFolder.set(folder, [])
      byFolder.get(folder).push(file)
    } else if (ext === '.sm' || ext === '.ssc') {
      const baseSm = path.basename(file, ext).toLowerCase()
      const folderPath = path.dirname(file)
      if (!bySmBase.has(baseSm)) bySmBase.set(baseSm, new Set())
      bySmBase.get(baseSm).add(folderPath)
    }
  }
  return { byBase, byFolder, bySmBase }
}

function parseMusicFilename(smText) {
  const m = smText.match(/#MUSIC:([^;]+);/i)
  if (!m) return null
  return m[1].trim()
}

async function main() {
  const sourceArg = process.argv.slice(2).find((arg) => !String(arg).startsWith('-'))
  const sourceRoot = sourceArg ? path.resolve(process.cwd(), sourceArg) : SIMFILES_DIR
  const inputStats = mergeStats(
    await collectTreeStats(SIMFILES_DIR, (p) => /\.(sm|ssc)$/i.test(p), ROOT),
    await collectTreeStats(sourceRoot, (p) => /\.(ogg|mp3|wav)$/i.test(p), ROOT),
    await collectStats([path.join(ROOT, 'scripts', 'build-audio-lengths.mjs')], ROOT),
  )
  const { skip, reason } = await shouldSkipBuild({
    cachePath: CACHE_PATH,
    inputStats,
    outputPaths: [OUT_PATH],
    config: { sourceRoot },
    force: FORCE,
  })
  if (skip) {
    console.log(`[build-audio-lengths] up-to-date (${reason}) — skipping.`)
    return
  }
  try {
    await fs.access(sourceRoot)
  } catch {
    console.warn(`Source root not found: ${sourceRoot} — skipping audio length build.`)
    await fs.mkdir(GENERATED_DIR, { recursive: true })
    await fs.writeFile(OUT_PATH, JSON.stringify({}, null, 2))
    console.log(`Wrote ${OUT_PATH} (0 entries)`)
    await writeCache(CACHE_PATH, inputStats, { sourceRoot })
    return
  }

  await fs.mkdir(GENERATED_DIR, { recursive: true })
  const bitsIdx = await indexBits(sourceRoot)
  // Promise-valued entries deduplicate concurrent requests for the same audio path.
  const durationCache = new Map()
  async function probeWithFfprobe(p, fallback = 0) {
    const ffprobe = process.env.FFPROBE || 'ffprobe'
    return new Promise((resolve) => {
      const cp = spawn(ffprobe, ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', p])
      let out = ''
      cp.stdout.on('data', (d) => out += d.toString())
      cp.on('close', () => {
        const val = Number(parseFloat(out))
        resolve(Number.isFinite(val) ? val : fallback)
      })
      cp.on('error', () => resolve(fallback))
    })
  }

  async function getDuration(p) {
    if (durationCache.has(p)) return durationCache.get(p)
    const pending = (async () => {
      try {
        const meta = await parseFile(p)
        let sec = Number(meta.format.duration || 0)
        if (!isReasonableAudioSeconds(sec)) {
          sec = await probeWithFfprobe(p, sec)
        }
        if (!isReasonableAudioSeconds(sec)) sec = 0
        return sec
      } catch {
        return 0
      }
    })()
    durationCache.set(p, pending)
    return pending
  }

  const processSimfile = async (smPath) => {
    const rel = path.posix.join('sm', path.relative(SIMFILES_DIR, smPath).replace(/\\/g, '/')) // e.g., sm/Folder/Song.sm
    let text
    try {
      text = await fs.readFile(smPath, 'utf-8')
    } catch {
      return null
    }
    const musicFile = parseMusicFilename(text)
    const titleMatch = text.match(/#TITLE:([^;]+);/i)
    const titleTranslitMatch = text.match(/#TITLETRANSLIT:([^;]+);/i)
    const titleNorm = titleMatch ? normalizeName(titleMatch[1]) : null
    const titleTransNorm = titleTranslitMatch ? normalizeName(titleTranslitMatch[1]) : null
    const base = musicFile ? path.basename(musicFile).toLowerCase() : null
    const messages = []

    // Attempt direct match using ddrbits SM path (same SM/SSC name inside a song folder)
    const relParts = rel.split('/') // ['sm','2013','Song.sm']
    if (relParts.length >= 3) {
      const mixDir = relParts[1]
      const songBase = path.basename(relParts[2], path.extname(relParts[2]))
      const songFolder = path.join(sourceRoot, mixDir, songBase)
      let directAudio = null
      try {
        const entries = await fs.readdir(songFolder)
        // prefer exact #MUSIC filename if present
        if (musicFile) {
          const candidate = path.join(songFolder, path.basename(musicFile))
          try { await fs.access(candidate); directAudio = candidate } catch {}
        }
        if (!directAudio) {
          // fallback: pick first audio file in folder (prefer .ogg), longest duration
          const audioFiles = entries
            .filter(n => /\.(ogg|mp3|wav)$/i.test(n))
            .map(n => path.join(songFolder, n))
          let best = { path: null, sec: 0 }
          for (const cand of audioFiles) {
            const sec = await getDuration(cand)
            if (sec > best.sec) best = { path: cand, sec }
          }
          if (best.path) directAudio = best.path
        }
      } catch {}
      if (directAudio) {
        const sec = await getDuration(directAudio)
        if (sec > 0) {
          messages.push({
            level: 'log',
            text: `OK ${rel} -> ${path.basename(directAudio)} = ${sec.toFixed(3)}s${sec < 10 ? ' (short?)' : ''}`,
          })
          return {
            rel,
            entry: { lengthSeconds: Number(sec.toFixed(3)), audioPath: directAudio },
            messages,
          }
        }
      }
    }

    // Fallback: collect candidates via folder and basename indices
    const candSet = new Set()
    if (titleNorm && bitsIdx.byFolder.has(titleNorm)) {
      for (const p of bitsIdx.byFolder.get(titleNorm)) candSet.add(p)
    }
    if (titleTransNorm && bitsIdx.byFolder.has(titleTransNorm)) {
      for (const p of bitsIdx.byFolder.get(titleTransNorm)) candSet.add(p)
    }
    if (candSet.size === 0 && base && bitsIdx.byBase.has(base)) {
      for (const p of bitsIdx.byBase.get(base)) candSet.add(p)
    }
    // Fallback: find ddrbits folders containing the same SM/SSC base name
    if (candSet.size === 0) {
      const smBaseLower = path.basename(relParts?.[2] || '', path.extname(relParts?.[2] || '')).toLowerCase()
      const folders = bitsIdx.bySmBase.get(smBaseLower)
      if (folders && folders.size) {
        for (const folder of folders) {
          try {
            const entries = await fs.readdir(folder)
            for (const n of entries) {
              if (/\.(ogg|mp3|wav)$/i.test(n)) candSet.add(path.join(folder, n))
            }
          } catch {}
        }
      }
    }
    const candidates = Array.from(candSet)
    if (!candidates || candidates.length === 0) return { rel, entry: null, messages }
    let best = { path: null, sec: 0 }
    for (const cand of candidates) {
      const sec = await getDuration(cand)
      if (sec > best.sec) best = { path: cand, sec }
    }
    if (best.path && best.sec > 0) {
      messages.push({
        level: 'log',
        text: `OK ${rel} -> ${path.basename(best.path)} = ${best.sec.toFixed(3)}s${best.sec < 10 ? ' (short?)' : ''}`,
      })
      return {
        rel,
        entry: { lengthSeconds: Number(best.sec.toFixed(3)), audioPath: best.path },
        messages,
      }
    }
    messages.push({
      level: 'warn',
      text: `No valid duration for ${rel} (candidates: ${candidates.length})`,
    })
    return { rel, entry: null, messages }
  }

  const simfilePaths = []
  for await (const smPath of walk(SIMFILES_DIR)) {
    if (smPath.toLowerCase().endsWith('.sm') || smPath.toLowerCase().endsWith('.ssc')) {
      simfilePaths.push(smPath)
    }
  }
  const requestedConcurrency = Number.parseInt(process.env.DDR_AUDIO_CONCURRENCY || '', 10)
  const availableConcurrency = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length
  const configuredConcurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
    ? requestedConcurrency
    : Math.min(8, availableConcurrency)
  const concurrency = simfilePaths.length > 0
    ? Math.max(1, Math.min(simfilePaths.length, configuredConcurrency))
    : 0
  if (concurrency > 0) {
    console.log(`[build-audio-lengths] processing ${simfilePaths.length} simfiles with ${concurrency} concurrent jobs...`)
  }

  const results = new Array(simfilePaths.length)
  let currentIndex = 0
  const processWorker = async () => {
    while (true) {
      const index = currentIndex
      currentIndex += 1
      if (index >= simfilePaths.length) return
      results[index] = await processSimfile(simfilePaths[index])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => processWorker()))

  const out = {}
  for (const result of results) {
    if (!result) continue
    for (const message of result.messages) {
      if (message.level === 'warn') console.warn(message.text)
      else console.log(message.text)
    }
    if (result.entry) out[result.rel] = result.entry
  }
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2))
  console.log(`Wrote ${OUT_PATH} (${Object.keys(out).length} entries)`) 
  await writeCache(CACHE_PATH, inputStats, { sourceRoot })
}

main().catch(e => { console.error(e); process.exit(1) })
