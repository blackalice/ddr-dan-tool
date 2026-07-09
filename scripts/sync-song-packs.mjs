#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_PATH = process.env.SONG_PACKS_CONFIG ? path.resolve(process.env.SONG_PACKS_CONFIG) : path.join(ROOT, 'data', 'song-packs.config.json')
const DEFAULT_USER_AGENT = 'ddr-toolkit-pack-sync/1.0'
const ARCHIVE_EXTENSIONS = ['.zip']

const args = process.argv.slice(2)
const flags = new Set(args.filter(arg => arg.startsWith('--')))
const isList = flags.has('--list')
const isDryRun = flags.has('--dry-run')
const isForce = flags.has('--force')
const includeAll = flags.has('--all')

function getFlagValues(name) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1] && !args[i + 1].startsWith('--')) {
      values.push(args[i + 1])
      i += 1
    } else if (args[i].startsWith(`${name}=`)) {
      values.push(args[i].slice(name.length + 1))
    }
  }
  return values
}

const requestedPackIds = getFlagValues('--pack')

function usage() {
  console.log(`Usage: node scripts/sync-song-packs.mjs [--list] [--dry-run] [--force] [--all] [--pack <id>]

Examples:
  npm run packs:list
  npm run packs:update -- --dry-run
  npm run packs:update -- --pack world
  npm run packs:update:all`)
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

function resolveRoot(config, key) {
  return path.resolve(ROOT, config[key])
}

function normalizeUrl(baseUrl, href) {
  return new URL(href, `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

function assertSafeFolderName(folderName) {
  if (!folderName || typeof folderName !== 'string') {
    throw new Error('folderName is required')
  }
  if (folderName.includes('/') || folderName.includes('\\') || folderName === '.' || folderName === '..') {
    throw new Error(`Unsafe folderName: ${folderName}`)
  }
}

function sanitizeFilename(name) {
  return path.basename(String(name || '')).replace(/[^a-zA-Z0-9._ -]/g, '_')
}

function isArchiveName(name) {
  return ARCHIVE_EXTENSIONS.includes(path.extname(String(name)).toLowerCase())
}

function isZipBuffer(buffer) {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

function getContentDispositionFilename(value) {
  if (!value) return null
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match) return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ''))
  const asciiMatch = value.match(/filename="?([^";]+)"?/i)
  return asciiMatch ? asciiMatch[1].trim() : null
}


async function fetchText(url, baseUrl) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      ...(process.env.ZIV_COOKIE ? { Cookie: process.env.ZIV_COOKIE } : {}),
      Referer: baseUrl,
    },
  })
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
  return response.text()
}

async function downloadArchive(url, baseUrl, cacheRoot, packId) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      ...(process.env.ZIV_COOKIE ? { Cookie: process.env.ZIV_COOKIE } : {}),
      Referer: baseUrl,
    },
  })
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
  if (!response.body) throw new Error(`GET ${url} did not return a response body`)

  const filename = getContentDispositionFilename(response.headers.get('content-disposition'))
  const archiveName = filename && isArchiveName(filename)
    ? sanitizeFilename(filename)
    : `${packId}.zip`
  const archivePath = path.join(cacheRoot, archiveName)
  const tempPath = path.join(cacheRoot, `.${packId}-${process.pid}.download`)
  const hash = createHash('sha256')
  const file = await fs.open(tempPath, 'w')
  let bytes = 0
  let magic = Buffer.alloc(0)

  try {
    for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk)
      if (magic.length < 4) {
        magic = Buffer.concat([magic, buffer.subarray(0, 4 - magic.length)])
      }
      hash.update(buffer)
      await file.write(buffer)
      bytes += buffer.length
    }
  } finally {
    await file.close()
  }

  const contentType = response.headers.get('content-type') || ''
  if (!isZipBuffer(magic)) {
    await fs.rm(tempPath, { force: true })
    const hint = contentType.includes('html')
      ? 'received HTML instead of a zip; ZIv may require login cookies'
      : `received ${contentType || 'unknown content type'}`
    throw new Error(`${packId}: download did not look like a zip (${hint})`)
  }

  await fs.rm(archivePath, { force: true })
  await fs.rename(tempPath, archivePath)
  return {
    archivePath,
    bytes,
    filename: archiveName,
    contentType,
    finalUrl: response.url,
    sha256: hash.digest('hex'),
  }
}
async function resolveCategoryId(config, pack, categoryIndex) {
  if (pack.categoryId) return Number(pack.categoryId)
  const key = String(pack.categoryName || '').trim().toLowerCase()
  if (!key) throw new Error(`${pack.id}: categoryId or categoryName is required`)
  if (!categoryIndex.size) {
    const indexUrl = normalizeUrl(config.zivBaseUrl, 'simfiles.php?category=simfiles')
    const html = await fetchText(indexUrl, config.zivBaseUrl)
    const $ = cheerio.load(html)
    $('option').each((_index, option) => {
      const label = $(option).text().replace(/\s+/g, ' ').trim()
      const value = String($(option).attr('value') || '').trim()
      if (!label || !/^\d+$/.test(value)) return
      categoryIndex.set(label.toLowerCase(), Number(value))
    })
  }
  const categoryId = categoryIndex.get(key)
  if (!categoryId) throw new Error(`${pack.id}: could not resolve ZIv category "${pack.categoryName}"`)
  return categoryId
}

async function getPackDownloadUrl(config, categoryId) {
  const categoryUrl = normalizeUrl(config.zivBaseUrl, `viewsimfilecategory.php?categoryid=${categoryId}`)
  const html = await fetchText(categoryUrl, config.zivBaseUrl)
  const $ = cheerio.load(html)
  for (const link of $('a').toArray()) {
    const label = $(link).text().replace(/\s+/g, ' ').trim().toLowerCase()
    const href = $(link).attr('href')
    if (!href || !label.includes('download pack')) continue
    return normalizeUrl(config.zivBaseUrl, href)
  }
  throw new Error(`No "Download Pack" link found for category ${categoryId}`)
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'pipe', ...options })
    let stderr = ''
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`))
    })
  })
}

async function emptyDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function extractArchive(archivePath, destination) {
  await emptyDir(destination)
  if (process.platform === 'win32') {
    await run('powershell', [
      '-NoProfile',
      '-Command',
      '$archive=$env:DDR_ARCHIVE_PATH; $destination=$env:DDR_EXTRACT_DESTINATION; Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force',
    ], {
      env: {
        ...process.env,
        DDR_ARCHIVE_PATH: archivePath,
        DDR_EXTRACT_DESTINATION: destination,
      },
    })
    return
  }
  await run('unzip', ['-q', '-o', archivePath, '-d', destination])
}

async function walkFiles(dir) {
  const out = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  return out
}

async function findContentRoot(extractRoot) {
  let current = extractRoot
  for (let depth = 0; depth < 3; depth += 1) {
    const files = await walkFiles(current)
    if (files.some(file => /\.(sm|ssc)$/i.test(file))) return current
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    const dirs = entries.filter(entry => entry.isDirectory())
    if (dirs.length !== 1) break
    current = path.join(current, dirs[0].name)
  }
  return current
}

async function copyTree(source, destination) {
  await fs.mkdir(destination, { recursive: true })
  const entries = await fs.readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)
    if (entry.isDirectory()) {
      await copyTree(sourcePath, destinationPath)
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true })
      await fs.copyFile(sourcePath, destinationPath)
    }
  }
}

async function renameWithRetry(source, destination, attempts = 5) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fs.rename(source, destination)
      return true
    } catch (error) {
      lastError = error
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) throw error
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
  if (lastError?.code === 'ENOENT') throw lastError
  return false
}

async function replaceDirectory(source, destination) {
  const parent = path.dirname(destination)
  const staging = path.join(parent, `.${path.basename(destination)}.next-${process.pid}`)
  const previous = path.join(parent, `.${path.basename(destination)}.previous-${process.pid}`)
  await fs.rm(staging, { recursive: true, force: true })
  await fs.rm(previous, { recursive: true, force: true })
  await copyTree(source, staging)

  const destinationExists = await fs.access(destination).then(() => true).catch(() => false)
  let movedDestination = false
  if (destinationExists) {
    movedDestination = await renameWithRetry(destination, previous)
    if (!movedDestination) {
      await fs.rm(destination, { recursive: true, force: true })
    }
  }

  try {
    const renamed = await renameWithRetry(staging, destination)
    if (!renamed) {
      await fs.rm(destination, { recursive: true, force: true })
      await copyTree(staging, destination)
    }
    await fs.rm(previous, { recursive: true, force: true })
  } catch (error) {
    await fs.rm(destination, { recursive: true, force: true }).catch(() => {})
    if (movedDestination) await renameWithRetry(previous, destination).catch(() => {})
    throw error
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}
async function writeManifest(cacheRoot, pack, payload) {
  await fs.writeFile(path.join(cacheRoot, `${pack.id}.json`), JSON.stringify(payload, null, 2))
}

async function readManifest(cacheRoot, pack) {
  return readJson(path.join(cacheRoot, `${pack.id}.json`)).catch(() => null)
}

function selectPacks(config) {
  if (includeAll) return config.packs
  if (requestedPackIds.length) {
    const requested = new Set(requestedPackIds)
    const selected = config.packs.filter(pack => requested.has(pack.id))
    const found = new Set(selected.map(pack => pack.id))
    const missing = [...requested].filter(id => !found.has(id))
    if (missing.length) throw new Error(`Unknown pack id(s): ${missing.join(', ')}`)
    return selected
  }
  return config.packs.filter(pack => pack.enabled)
}

async function syncPack(config, pack, roots, categoryIndex) {
  assertSafeFolderName(pack.folderName)
  const categoryId = await resolveCategoryId(config, pack, categoryIndex)
  const downloadUrl = pack.downloadUrl
    ? normalizeUrl(config.zivBaseUrl, pack.downloadUrl)
    : await getPackDownloadUrl(config, categoryId)
  const destination = path.join(roots.sourceRoot, pack.folderName)

  if (isDryRun) {
    console.log(`[packs] ${pack.id}: ${downloadUrl} -> ${path.relative(ROOT, destination)}`)
    return
  }

  const downloaded = await downloadArchive(downloadUrl, config.zivBaseUrl, roots.cacheRoot, pack.id)
  const digest = downloaded.sha256
  const previous = await readManifest(roots.cacheRoot, pack)

  if (!isForce && previous?.sha256 === digest && await fs.access(destination).then(() => true).catch(() => false)) {
    console.log(`[packs] ${pack.id}: up-to-date`)
    return
  }

  const extractRoot = path.join(roots.cacheRoot, `${pack.id}-extract`)
  await extractArchive(downloaded.archivePath, extractRoot)
  const contentRoot = await findContentRoot(extractRoot)
  const files = await walkFiles(contentRoot)
  const simfileCount = files.filter(file => /\.(sm|ssc)$/i.test(file)).length
  if (simfileCount === 0) {
    throw new Error(`${pack.id}: downloaded archive did not contain .sm or .ssc files`)
  }

  await replaceDirectory(contentRoot, destination)
  await writeManifest(roots.cacheRoot, pack, {
    version: 1,
    packId: pack.id,
    categoryId,
    downloadUrl,
    finalUrl: downloaded.finalUrl,
    filename: downloaded.filename,
    contentType: downloaded.contentType,
    sha256: digest,
    bytes: downloaded.bytes,
    simfileCount,
    syncedAt: new Date().toISOString(),
  })
  await fs.rm(extractRoot, { recursive: true, force: true })
  console.log(`[packs] ${pack.id}: synced ${simfileCount} simfile(s) to ${path.relative(ROOT, destination)}`)
}

const config = await readJson(CONFIG_PATH)
const roots = {
  sourceRoot: resolveRoot(config, 'sourceRoot'),
  cacheRoot: resolveRoot(config, 'downloadCacheRoot'),
}

if (!config.zivBaseUrl || !Array.isArray(config.packs)) {
  throw new Error('Invalid song pack config')
}

if (flags.has('--help')) {
  usage()
  process.exit(0)
}

if (isList) {
  for (const pack of config.packs) {
    const state = pack.enabled ? 'enabled ' : 'disabled'
    const category = pack.categoryId ? `category ${pack.categoryId}` : pack.categoryName
    console.log(`${pack.id.padEnd(24)} ${state} ${pack.folderName.padEnd(28)} ${category}`)
  }
  process.exit(0)
}

await fs.mkdir(roots.sourceRoot, { recursive: true })
await fs.mkdir(roots.cacheRoot, { recursive: true })

const selectedPacks = selectPacks(config)
if (!selectedPacks.length) {
  console.log('[packs] no packs selected')
  process.exit(0)
}

const categoryIndex = new Map()
for (const pack of selectedPacks) {
  await syncPack(config, pack, roots, categoryIndex)
}
