#!/usr/bin/env node
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'cheerio'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const RANKINGS_DIR = path.join(DATA_DIR, 'rankings')
const OUTPUT_PATH = path.join(RANKINGS_DIR, 'combined_song_ratings.json')
const METADATA_PATH = path.join(RANKINGS_DIR, 'sanbai-rankings-metadata.json')
const METADATA_MODULE_PATH = path.join(ROOT, 'src', 'utils', 'sanbaiRankingsMetadata.js')
const SIBLING_SCRAPER_DIR = path.resolve(ROOT, '..', 'sanbai-scraper')
const HISTORY_PAGE_COUNT = 19
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.SANBAI_FETCH_TIMEOUT_MS || '8000', 10)
const SKIP_NETWORK = process.argv.includes('--no-network') || process.env.SANBAI_SKIP_NETWORK === '1'

const modeForPrefix = new Map([
  ['single_ranked', 'single_rankings'],
  ['doubles_ranked', 'doubles_rankings'],
])

function normalizeVersionNumber(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMetadataLabel({ version, revision }) {
  if (Number.isInteger(version) && Number.isInteger(revision)) {
    return `Version ${version} Revision ${revision}`
  }
  if (Number.isInteger(version)) return `Version ${version}`
  return 'Sanbai Ice Cream rankings'
}

function compareRankingVersions(a, b) {
  const aVersion = Number.isInteger(a?.version) ? a.version : -1
  const bVersion = Number.isInteger(b?.version) ? b.version : -1
  if (aVersion !== bVersion) return aVersion - bVersion
  const aRevision = Number.isInteger(a?.revision) ? a.revision : -1
  const bRevision = Number.isInteger(b?.revision) ? b.revision : -1
  return aRevision - bRevision
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function readText(file, fallback = null) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return fallback
  }
}

async function readJson(file, fallback = null) {
  const text = await readText(file)
  if (!text) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function parseSongName(cell, $) {
  const textNode = $(cell)
    .contents()
    .filter((_, node) => node.type === 'text')
    .first()
    .text()
    .trim()
  return textNode || $(cell).text().replace(/\s+/g, ' ').trim()
}

function parseRankingHtml(html) {
  const $ = load(html)
  const versions = []
  $('table tr').first().find('th').each((_, th) => {
    const text = $(th)
      .contents()
      .filter((__, node) => node.type === 'text')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
    const match = text.match(/\bv(\d+)\b/i)
    if (!match) return
    const version = normalizeVersionNumber(match[1])
    const date = $(th).find('.sp-version-date').first().text().trim() || null
    if (version) versions.push({ version, date })
  })

  const rows = []
  $('table tr').slice(1).each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return
    const songName = parseSongName(cells[1], $)
    const rating = Number.parseFloat($(cells[cells.length - 1]).text().trim())
    if (!songName || !Number.isFinite(rating)) return
    rows.push([songName, rating])
  })

  return { rows, versions }
}

async function parseRankingDirectory(directory, sourceLabel, revision = null) {
  const songMap = new Map()
  const versionMap = new Map()
  let filesParsed = 0

  for (const [prefix, rankingKey] of modeForPrefix.entries()) {
    for (let level = 1; level <= HISTORY_PAGE_COUNT; level += 1) {
      const file = path.join(directory, `${prefix}_${level}.html`)
      const html = await readText(file)
      if (!html) continue
      const { rows, versions } = parseRankingHtml(html)
      if (!rows.length && !versions.length) continue
      filesParsed += 1
      for (const item of versions) {
        const current = versionMap.get(item.version)
        if (!current || (!current.date && item.date)) versionMap.set(item.version, item)
      }
      for (const [songName, rating] of rows) {
        if (!songMap.has(songName)) {
          songMap.set(songName, { single_rankings: new Set(), doubles_rankings: new Set() })
        }
        songMap.get(songName)[rankingKey].add(rating)
      }
    }
  }

  const latestVersion = Math.max(0, ...versionMap.keys())
  const latest = latestVersion ? versionMap.get(latestVersion) : null
  const songs = [...songMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([songName, rankings]) => ({
      song_name: songName,
      single_rankings: [...rankings.single_rankings].sort((a, b) => a - b),
      doubles_rankings: [...rankings.doubles_rankings].sort((a, b) => a - b),
    }))

  return {
    songs,
    metadata: {
      source: sourceLabel,
      version: latestVersion || null,
      revision,
      latestDate: latest?.date || null,
      label: formatMetadataLabel({ version: latestVersion || null, revision }),
      songCount: songs.length,
      filesParsed,
      updatedAt: new Date().toISOString(),
    },
  }
}

async function fetchText(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'ddr-dan-tool-data-updater/1.0' },
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchLiveRankings() {
  if (SKIP_NETWORK) throw new Error('network fetch disabled')
  const tempDir = await fs.mkdtemp(path.join('/tmp', 'sanbai-rankings-'))
  for (const [prefix] of modeForPrefix.entries()) {
    const isDouble = prefix === 'doubles_ranked'
    for (let level = 1; level <= HISTORY_PAGE_COUNT; level += 1) {
      const suffix = isDouble ? '?spdp=1' : ''
      const url = `https://3icecream.com/difficulty_list/history/${level}${suffix}`
      const html = await fetchText(url)
      const file = path.join(tempDir, `${prefix}_${level}.html`)
      await fs.writeFile(file, html)
    }
  }
  return parseRankingDirectory(tempDir, 'https://3icecream.com/difficulty_list/history')
}

async function findLocalRankingSource() {
  const entries = await fs.readdir(SIBLING_SCRAPER_DIR, { withFileTypes: true }).catch(() => [])
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const match = entry.name.match(/^(\d+)r(\d+)$/i)
    if (!match) continue
    const directory = path.join(SIBLING_SCRAPER_DIR, entry.name)
    const single = path.join(directory, 'single_ranked_1.html')
    const double = path.join(directory, 'doubles_ranked_1.html')
    try {
      await fs.access(single)
      await fs.access(double)
      candidates.push({
        directory,
        version: Number.parseInt(match[1], 10),
        revision: Number.parseInt(match[2], 10),
      })
    } catch {
      // Ignore incomplete scraper folders.
    }
  }
  candidates.sort((a, b) => (b.version - a.version) || (b.revision - a.revision))
  return candidates[0] || null
}

async function loadLocalRankings() {
  const source = await findLocalRankingSource()
  if (source) {
    return parseRankingDirectory(
      source.directory,
      path.relative(ROOT, source.directory).replaceAll('\\', '/'),
      source.revision,
    )
  }

  const fallbackJson = path.join(SIBLING_SCRAPER_DIR, 'parser_new', 'combined_song_ratings.json')
  const songs = await readJson(fallbackJson)
  if (Array.isArray(songs)) {
    return {
      songs,
      metadata: {
        source: path.relative(ROOT, fallbackJson).replaceAll('\\', '/'),
        version: null,
        revision: null,
        latestDate: null,
        label: 'Sanbai Ice Cream rankings',
        songCount: songs.length,
        filesParsed: 0,
        updatedAt: new Date().toISOString(),
      },
    }
  }
  throw new Error('No local Sanbai scraper output found')
}

async function loadExistingRankings() {
  const songs = await readJson(OUTPUT_PATH)
  const metadata = await readJson(METADATA_PATH)
  if (!Array.isArray(songs) || !metadata || typeof metadata !== 'object') return null
  return { songs, metadata: { ...metadata, source: metadata.source || 'data/rankings/combined_song_ratings.json' } }
}

function normalizePayload({ songs, metadata }) {
  return {
    songs,
    metadata: {
      ...metadata,
      songCount: songs.length,
      singleChartCount: songs.reduce((sum, entry) => sum + (entry.single_rankings?.length || 0), 0),
      doubleChartCount: songs.reduce((sum, entry) => sum + (entry.doubles_rankings?.length || 0), 0),
    },
  }
}

async function writeIfChanged(file, content) {
  const current = await readText(file)
  if (current === content) return false
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
  return true
}

async function main() {
  let payload
  try {
    payload = await fetchLiveRankings()
    console.log('[sanbai-rankings] fetched live rankings')
  } catch (error) {
    console.warn(`[sanbai-rankings] live fetch unavailable: ${error.message}`)
    const localPayload = await loadLocalRankings()
    const existingPayload = await loadExistingRankings()
    if (existingPayload && compareRankingVersions(existingPayload.metadata, localPayload.metadata) > 0) {
      payload = existingPayload
      console.log(`[sanbai-rankings] keeping newer existing rankings from ${payload.metadata.source}`)
    } else {
      payload = localPayload
      console.log(`[sanbai-rankings] using local rankings from ${payload.metadata.source}`)
    }
  }

  const normalized = normalizePayload(payload)
  const rankingsJson = `${JSON.stringify(normalized.songs, null, 2)}\n`
  normalized.metadata.sha256 = hashContent(rankingsJson)
  const existingMetadata = await readJson(METADATA_PATH)
  if (
    existingMetadata?.sha256 === normalized.metadata.sha256 &&
    compareRankingVersions(existingMetadata, normalized.metadata) === 0 &&
    existingMetadata.updatedAt
  ) {
    normalized.metadata.updatedAt = existingMetadata.updatedAt
  }
  const metadataJson = `${JSON.stringify(normalized.metadata, null, 2)}\n`
  const metadataModule = `export const SANBAI_RANKINGS_METADATA = ${JSON.stringify(normalized.metadata, null, 2)};\n\nexport default SANBAI_RANKINGS_METADATA;\n`

  const rankingsChanged = await writeIfChanged(OUTPUT_PATH, rankingsJson)
  const metadataChanged = await writeIfChanged(METADATA_PATH, metadataJson)
  const moduleChanged = await writeIfChanged(METADATA_MODULE_PATH, metadataModule)

  const changed = rankingsChanged || metadataChanged || moduleChanged
  console.log(
    `[sanbai-rankings] ${changed ? 'updated' : 'current'} ${normalized.metadata.label}: ` +
    `${normalized.metadata.songCount} songs, ` +
    `${normalized.metadata.singleChartCount} SP ratings, ` +
    `${normalized.metadata.doubleChartCount} DP ratings`,
  )
}

main().catch((error) => {
  console.error('[sanbai-rankings] failed', error)
  process.exitCode = 1
})
