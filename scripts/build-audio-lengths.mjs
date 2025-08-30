#!/usr/bin/env node
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseFile } from 'music-metadata'
import { spawn } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const PUBLIC_SM_DIR = path.join(ROOT, 'public', 'sm')
const LOCAL_DIR = path.join(ROOT, '.local')
const OUT_PATH = path.join(LOCAL_DIR, 'audio-lengths.json')

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
  const sourceRoot = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : path.resolve(ROOT, 'ddrbits')
  try {
    await fs.access(sourceRoot)
  } catch {
    console.error(`Source root not found: ${sourceRoot}`)
    process.exit(2)
  }

  await fs.mkdir(LOCAL_DIR, { recursive: true })
  const bitsIdx = await indexBits(sourceRoot)
  const durationCache = new Map()
  async function getDuration(p) {
    if (durationCache.has(p)) return durationCache.get(p)
    try {
      const meta = await parseFile(p)
      let sec = Number(meta.format.duration || 0)
      if (!sec || sec < 10) {
        // Fallback to ffprobe when available
        const ffprobe = process.env.FFPROBE || 'ffprobe'
        sec = await new Promise((resolve) => {
          const cp = spawn(ffprobe, ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', p])
          let out = ''
          cp.stdout.on('data', (d) => out += d.toString())
          cp.on('close', () => {
            const val = Number(parseFloat(out))
            resolve(Number.isFinite(val) ? val : (meta.format.duration || 0))
          })
          cp.on('error', () => resolve(meta.format.duration || 0))
        })
      }
      durationCache.set(p, sec)
      return sec
    } catch {
      durationCache.set(p, 0)
      return 0
    }
  }

  const out = {}
  for await (const smPath of walk(PUBLIC_SM_DIR)) {
    if (!smPath.toLowerCase().endsWith('.sm') && !smPath.toLowerCase().endsWith('.ssc')) continue
    const rel = path.relative(path.join(ROOT, 'public'), smPath).replace(/\\/g, '/') // e.g., sm/Folder/Song.sm
    let text
    try {
      text = await fs.readFile(smPath, 'utf-8')
    } catch { continue }
    const musicFile = parseMusicFilename(text)
    const titleMatch = text.match(/#TITLE:([^;]+);/i)
    const titleTranslitMatch = text.match(/#TITLETRANSLIT:([^;]+);/i)
    const titleNorm = titleMatch ? normalizeName(titleMatch[1]) : null
    const titleTransNorm = titleTranslitMatch ? normalizeName(titleTranslitMatch[1]) : null
    const base = musicFile ? path.basename(musicFile).toLowerCase() : null

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
          out[rel] = { lengthSeconds: Number(sec.toFixed(3)), audioPath: directAudio }
          const note = sec < 10 ? ' (short?)' : ''
          console.log(`OK ${rel} -> ${path.basename(directAudio)} = ${sec.toFixed(3)}s${note}`)
          continue
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
    if (!candidates || candidates.length === 0) continue
    let best = { path: null, sec: 0 }
    for (const cand of candidates) {
      const sec = await getDuration(cand)
      if (sec > best.sec) best = { path: cand, sec }
    }
    if (best.path && best.sec > 0) {
      out[rel] = { lengthSeconds: Number(best.sec.toFixed(3)), audioPath: best.path }
      const note = best.sec < 10 ? ' (short?)' : ''
      console.log(`OK ${rel} -> ${path.basename(best.path)} = ${best.sec.toFixed(3)}s${note}`)
    } else {
      console.warn(`No valid duration for ${rel} (candidates: ${candidates.length})`)
    }
  }
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2))
  console.log(`Wrote ${OUT_PATH} (${Object.keys(out).length} entries)`) 
}

main().catch(e => { console.error(e); process.exit(1) })
