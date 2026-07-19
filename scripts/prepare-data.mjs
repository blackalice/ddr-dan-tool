#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CACHE_DIR = path.join(ROOT, 'data', 'generated', '.cache')
const PIPELINE_CACHE = path.join(CACHE_DIR, 'data-pipeline-v2.json')
const HASH_CACHE = path.join(CACHE_DIR, 'content-hashes-v1.json')
const FORCE = process.argv.includes('--force')
const VALIDATE = process.argv.includes('--validate')
const MAX_PARALLEL = Math.max(
  1,
  Number.parseInt(process.env.DATA_PREPARE_JOBS || '', 10) || os.cpus().length - 1 || 3
)

const rel = (...parts) => path.join(ROOT, ...parts)
const scripts = (...names) => names.map(name => rel('scripts', name))
const files = (...names) => names.map(name => rel(...name.split('/')))

const tasks = [
  {
    id: 'sanbai-rankings',
    command: 'update-sanbai-rankings.mjs',
    alwaysRun: true,
    inputs: [
      { tree: rel('..', 'sanbai-scraper'), match: /(?:single_ranked|doubles_ranked)_\d+\.html$/i },
    ],
    sources: scripts('update-sanbai-rankings.mjs'),
    outputs: files(
      'data/rankings/combined_song_ratings.json',
      'data/rankings/sanbai-rankings-metadata.json',
      'src/utils/sanbaiRankingsMetadata.js',
    ),
  },
  {
    id: 'jackets',
    command: 'convert-jackets-webp.mjs',
    inputs: [{ tree: rel('data', 'simfiles'), match: /\.(png|jpe?g)$/i }],
    sources: scripts('convert-jackets-webp.mjs', 'cache-utils.mjs'),
    outputs: [],
  },
  {
    id: 'sm-list',
    command: 'generate-sm-list.mjs',
    deps: ['jackets'],
    inputs: [
      { tree: rel('data', 'simfiles'), match: /\.(sm|ssc)$/i },
      { tree: rel('data', 'simfiles'), match: /-jacket\.(png|jpe?g|webp)$/i },
      { file: rel('data', 'song-ids.json') },
    ],
    sources: scripts('generate-sm-list.mjs', 'songIdUtils.mjs', 'cache-utils.mjs'),
    outputs: files('data/generated/sm-files.json'),
  },
  {
    id: 'song-index',
    command: 'generate-song-index.mjs',
    deps: ['sm-list'],
    inputs: [
      { file: rel('data', 'generated', 'sm-files.json') },
    ],
    sources: scripts('generate-song-index.mjs'),
    outputs: files('data/generated/song-index.json'),
  },
  {
    id: 'processed-data',
    command: 'generate-processed-data.mjs',
    deps: ['sm-list', 'sanbai-rankings'],
    inputs: [
      { file: rel('data', 'generated', 'sm-files.json') },
      { file: rel('data', 'courses', 'course-data.json') },
      { tree: rel('data', 'courses'), match: /\.(crs|html)$/i },
      { file: rel('data', 'rankings', 'combined_song_ratings.json') },
      { file: rel('data', 'song-ids.json') },
    ],
    sources: [...scripts('generate-processed-data.mjs', 'songIdUtils.mjs', 'cache-utils.mjs'), ...files('src/utils/chartIdentity.js')],
    outputs: files('data/generated/dan-data.json', 'data/generated/vega-data.json', 'data/generated/courses-data.json'),
  },
  {
    id: 'audio-analysis',
    command: 'build-audio-lengths.mjs',
    deps: ['sm-list'],
    inputs: [
      { tree: rel('data', 'simfiles'), match: /\.(sm|ssc|ogg|mp3|wav)$/i },
    ],
    sources: scripts('build-audio-lengths.mjs', 'cache-utils.mjs'),
    outputs: files('data/generated/audio-lengths.json'),
  },
  {
    id: 'tech-counts',
    command: 'extract-stepmania-tech-counts.mjs',
    deps: ['sm-list'],
    inputs: [
      { file: rel('data', 'generated', 'sm-files.json') },
      { file: rel('data', 'song-ids.json') },
      { tree: rel('data', 'simfiles'), match: /\.(sm|ssc)$/i },
    ],
    sources: [
      ...scripts('extract-stepmania-tech-counts.mjs', 'extract-stepmania-tech-worker.mjs',
        'stepmania-tech-counts-utils.mjs', 'itgmania-tech-counts.mjs', 'cache-utils.mjs'),
      ...files('src/utils/smParser.js', 'src/utils/smParserUtils.js', 'src/utils/chartMetrics.js'),
    ],
    outputs: files('data/generated/stepmania-tech-counts.json'),
  },
  {
    id: 'song-lengths',
    command: 'generate-song-lengths.mjs',
    deps: ['sm-list', 'audio-analysis'],
    inputs: [
      { file: rel('data', 'generated', 'sm-files.json') },
      { file: rel('data', 'generated', 'audio-lengths.json') },
    ],
    sources: scripts('generate-song-lengths.mjs', 'cache-utils.mjs'),
    outputs: files('data/generated/song-lengths.json'),
  },
  {
    id: 'song-meta',
    command: 'generate-song-meta.mjs',
    deps: ['sm-list', 'tech-counts', 'song-lengths', 'sanbai-rankings'],
    inputs: [
      { file: rel('data', 'generated', 'sm-files.json') },
      { file: rel('data', 'generated', 'song-lengths.json') },
      { file: rel('data', 'generated', 'stepmania-tech-counts.json') },
      { file: rel('data', 'rankings', 'combined_song_ratings.json') },
      { file: rel('data', 'song-ids.json') },
    ],
    sources: [
      ...scripts('generate-song-meta.mjs', 'songIdUtils.mjs', 'cache-utils.mjs'),
      ...files('src/utils/smParser.js', 'src/utils/smParserUtils.js', 'src/utils/chartIds.js', 'src/utils/chartIdentity.js'),
    ],
    outputs: files('data/generated/song-meta.json'),
  },
  {
    id: 'world-challenges',
    command: 'generate-world-new-challenges.mjs',
    deps: ['song-meta'],
    inputs: [
      { file: rel('data', 'world', 'ddr_world_new_difficulties.csv') },
      { file: rel('data', 'generated', 'song-meta.json') },
    ],
    sources: [...scripts('generate-world-new-challenges.mjs', 'cache-utils.mjs'), ...files('src/utils/chartIds.js')],
    outputs: files('src/utils/worldNewChallengeChartsData.js'),
  },
  {
    id: 'song-identities',
    command: 'validate-song-identities.mjs',
    deps: ['song-meta'],
    inputs: [
      { tree: rel('data', 'ddr-ver'), match: /\.json$/i },
      { file: rel('data', 'generated', 'sm-files.json') },
      { file: rel('data', 'generated', 'song-meta.json') },
    ],
    sources: [
      ...scripts('validate-song-identities.mjs'),
      ...files('src/utils/chartIdentity.js', 'src/utils/stringSimilarity.js'),
    ],
    outputs: [],
  },
  {
    id: 'public-sync',
    command: 'sync-public-assets.mjs',
    deps: ['processed-data', 'world-challenges', 'song-index', 'song-identities'],
    alwaysRun: true,
    inputs: [],
    sources: scripts('sync-public-assets.mjs'),
    outputs: files(
      'public/sm-files.json',
      'public/song-index.json',
      'public/song-meta.json',
      'public/song-lengths.json',
      'public/dan-data.json',
      'public/vega-data.json',
      'public/courses-data.json',
    ),
  },
]

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

const pipelineCache = await readJson(PIPELINE_CACHE, { version: 2, tasks: {} })
const hashCache = await readJson(HASH_CACHE, { version: 1, files: {} })
const nextHashCache = { version: 1, files: {} }

async function walk(dir, match) {
  const found = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && (!match || match.test(full))) found.push(full)
    }
  }
  return found
}

async function digestFile(file) {
  let stat
  try {
    stat = await fs.stat(file)
  } catch {
    return 'missing'
  }
  const key = path.relative(ROOT, file).replaceAll('\\', '/')
  const cached = hashCache.files?.[key]
  if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
    nextHashCache.files[key] = cached
    return cached.sha256
  }
  const digest = createHash('sha256').update(await fs.readFile(file)).digest('hex')
  nextHashCache.files[key] = { size: stat.size, mtimeMs: stat.mtimeMs, sha256: digest }
  return digest
}

async function fingerprint(task) {
  const entries = []
  for (const input of task.inputs || []) {
    if (input.file) entries.push(input.file)
    if (input.tree) entries.push(...await walk(input.tree, input.match))
  }
  entries.push(...(task.sources || []))
  entries.sort((a, b) => a.localeCompare(b))
  const hash = createHash('sha256')
  for (const file of entries) {
    hash.update(path.relative(ROOT, file).replaceAll('\\', '/'))
    hash.update('\0')
    hash.update(await digestFile(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function outputsExist(task) {
  for (const output of task.outputs || []) {
    try {
      await fs.access(output)
    } catch {
      return false
    }
  }
  return true
}

function runScript(task) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    console.log(`[data] ${task.id}: running`)
    const child = spawn(process.execPath, [rel('scripts', task.command), '--force'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        console.log(`[data] ${task.id}: completed in ${((Date.now() - started) / 1000).toFixed(1)}s`)
        resolve()
      } else {
        reject(new Error(`${task.id} exited with code ${code}`))
      }
    })
  })
}

const states = new Map()
const taskById = new Map(tasks.map(task => [task.id, task]))

async function execute(task) {
  const currentFingerprint = await fingerprint(task)
  const dependencyStale = (task.deps || []).some(dep => states.get(dep) === 'stale')
  const stale = FORCE
    || (!VALIDATE && task.alwaysRun)
    || dependencyStale
    || pipelineCache.tasks?.[task.id]?.fingerprint !== currentFingerprint
    || !(await outputsExist(task))

  if (VALIDATE) {
    if (stale) states.set(task.id, 'stale')
    else states.set(task.id, 'current')
    console.log(`[data] ${task.id}: ${stale ? 'STALE' : 'current'}`)
    return
  }
  if (stale) await runScript(task)
  else console.log(`[data] ${task.id}: up-to-date`)

  pipelineCache.tasks[task.id] = {
    fingerprint: await fingerprint(task),
    completedAt: new Date().toISOString(),
  }
  states.set(task.id, 'done')
}

async function runGraph() {
  const pending = new Set(tasks.map(task => task.id))
  const running = new Map()
  while (pending.size || running.size) {
    for (const id of [...pending]) {
      if (running.size >= MAX_PARALLEL) break
      const task = taskById.get(id)
      if ((task.deps || []).every(dep => states.has(dep))) {
        pending.delete(id)
        const promise = execute(task).finally(() => running.delete(id))
        running.set(id, promise)
      }
    }
    if (!running.size && pending.size) {
      throw new Error(`Unresolvable task dependencies: ${[...pending].join(', ')}`)
    }
    if (running.size) await Promise.race(running.values())
  }
}

await fs.mkdir(CACHE_DIR, { recursive: true })
try {
  await runGraph()
  if (VALIDATE) {
    const stale = [...states].filter(([, state]) => state === 'stale').map(([id]) => id)
    if (stale.length) {
      console.error(`[data] stale tasks: ${stale.join(', ')}`)
      process.exitCode = 1
    } else {
      console.log('[data] all generated data is current')
    }
  } else {
    await fs.writeFile(PIPELINE_CACHE, JSON.stringify(pipelineCache, null, 2))
    await fs.writeFile(HASH_CACHE, JSON.stringify(nextHashCache, null, 2))
  }
} catch (error) {
  console.error(`[data] failed: ${error.message}`)
  process.exitCode = 1
}
