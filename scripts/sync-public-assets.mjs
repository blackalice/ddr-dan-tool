import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncTree } from './incremental-tree-sync.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA = path.join(ROOT, 'data')
const GENERATED = path.join(DATA, 'generated')
const PUBLIC = path.join(ROOT, 'public')
const CACHE = path.join(GENERATED, '.cache')
const FILE_MANIFEST = path.join(CACHE, 'public-files-manifest.json')

const files = [
  ['sm-files.json', path.join(GENERATED, 'sm-files.json')],
  ['song-index.json', path.join(GENERATED, 'song-index.json')],
  ['song-meta.json', path.join(GENERATED, 'song-meta.json')],
  ['song-lengths.json', path.join(GENERATED, 'song-lengths.json')],
  ['dan-data.json', path.join(GENERATED, 'dan-data.json')],
  ['vega-data.json', path.join(GENERATED, 'vega-data.json')],
  ['courses-data.json', path.join(GENERATED, 'courses-data.json')],
  ['combined_song_ratings.json', path.join(DATA, 'rankings', 'combined_song_ratings.json')],
  ['sanbai-rankings-metadata.json', path.join(DATA, 'rankings', 'sanbai-rankings-metadata.json')],
  ['vega-results.json', path.join(DATA, 'rankings', 'vega-results.json')],
]

await fs.mkdir(PUBLIC, { recursive: true })
const previousFiles = await fs.readFile(FILE_MANIFEST, 'utf8')
  .then(JSON.parse)
  .catch(() => ({ files: {} }))
const nextFiles = { version: 1, files: {} }
let copied = 0
let bytes = 0
for (const [name, source] of files) {
  const destination = path.join(PUBLIC, name)
  try {
    const sourceStat = await fs.stat(source)
    const signature = `${sourceStat.size}:${sourceStat.mtimeMs}`
    nextFiles.files[name] = signature
    const destinationExists = await fs.access(destination).then(() => true).catch(() => false)
    if (!destinationExists || previousFiles.files?.[name] !== signature) {
      await fs.copyFile(source, destination)
      copied += 1
      bytes += sourceStat.size
    }
  } catch {
    console.warn(`[sync-public-assets] missing file: ${path.relative(ROOT, source)}`)
  }
}
await fs.writeFile(FILE_MANIFEST, JSON.stringify(nextFiles, null, 2))

const isSimfileAsset = (source, relative) => {
  const ext = path.extname(source).toLowerCase()
  if (['.ogg', '.mp3', '.wav', '.mp4', '.avi', '.mpg', '.mpeg', '.webm', '.bga'].includes(ext)) return false
  if (ext === '.sm' || ext === '.ssc' || /-jacket\.(png|jpe?g|webp)$/i.test(source)) return true
  const parts = relative.split('/')
  return parts.length === 2
    && ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
    && path.basename(parts[1], ext).toLowerCase() === parts[0].toLowerCase()
}

const ddrRoot = path.join(DATA, 'ddr-ver')
const nestedDdrRoot = path.join(ddrRoot, 'ddr-ver')
const ddrSource = await fs.stat(nestedDdrRoot).then(() => nestedDdrRoot).catch(() => ddrRoot)
const smResult = await syncTree({
  source: path.join(DATA, 'simfiles'),
  destination: path.join(PUBLIC, 'sm'),
  manifestPath: path.join(CACHE, 'public-sm-manifest.json'),
  include: isSimfileAsset,
})
const ddrResult = await syncTree({
  source: ddrSource,
  destination: path.join(PUBLIC, 'ddr-ver'),
  manifestPath: path.join(CACHE, 'public-ddr-ver-manifest.json'),
})

copied += smResult.copied + ddrResult.copied
bytes += smResult.bytes + ddrResult.bytes
console.log(`[sync-public-assets] ${copied} copied, ${smResult.removed + ddrResult.removed} removed, ${(bytes / 1024 / 1024).toFixed(1)} MiB written`)
