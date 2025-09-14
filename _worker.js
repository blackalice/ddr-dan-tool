import { Hono } from 'hono'
import { parseGanymedeHtml } from './src/utils/parseGanymedeHtml.js'
import authApp, { authMiddleware } from './src/auth/index.js'

const app = new Hono()

// Global security headers (added to all responses)
app.use('*', async (c, next) => {
  await next()
  try {
    const isProd = (c.env?.ENV || '').toLowerCase() === 'production'
    const res = c.res
    if (!res || !res.headers) return
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'no-referrer')
    res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    res.headers.set('X-Frame-Options', 'DENY')
    if (isProd) {
      // Keep CSP moderate to avoid breaking the app; refine as needed
      // Allow Turnstile (scripts and frames) and general HTTPS connects.
      res.headers.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
      )
    }
  } catch { /* ignore header set errors */ }
})

// --- Encryption utils (AES-GCM) for user data at-rest ---
async function getDataKey(env) {
  const keyB64 = env?.DATA_KEY || null
  if (!keyB64) return null
  try {
    const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
    return key
  } catch (e) {
    console.warn('DATA_KEY invalid; storing plaintext. Error:', e)
    return null
  }
}

function toB64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))) }
function fromB64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)) }

async function encryptJson(obj, key) {
  if (!key) return obj
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const data = enc.encode(JSON.stringify(obj))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { enc: toB64(ct), iv: toB64(iv) }
}

async function decryptJson(record, key) {
  if (!key) return record
  if (!record || typeof record !== 'object' || !record.enc || !record.iv) return record
  const iv = fromB64(record.iv)
  const ct = fromB64(record.enc)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(pt))
}

// Mount auth routes under /api (e.g., /api/login, /api/signup, /api/refresh, /api/logout)
app.route('/api', authApp)

app.get('/api/hello', (c) => c.json({ message: 'Hello from Hono!' }))

app.post('/api/parse-scores', authMiddleware, async (c) => {
  const play = (c.req.query('playtype') || 'SP').toUpperCase();
  const playtype = play === 'DP' ? 'DP' : 'SP';

  const contentType = c.req.header('content-type') || '';
  let html = '';

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (file && typeof file.text === 'function') {
      html = await file.text();
    } else {
      html = (form.get('html') || '').toString();
    }
  } else {
    html = await c.req.text();
  }

  if (!html) {
    return c.json({ error: 'No HTML provided' }, 400);
  }

  const data = parseGanymedeHtml(html, playtype);
  return c.json(data);
})

const MAX_USER_DATA_BYTES = 256 * 1024 // 256 KiB

app.get('/api/user/data', authMiddleware, async (c) => {
  const userId = c.get('user').sub
  const row = await c.env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const raw = row ? JSON.parse(row.data) : {}
  const key = await getDataKey(c.env)
  const data = key ? await decryptJson(raw, key) : raw
  const email = c.get('user').email
  return c.json({ email, ...data })
})

app.put('/api/user/data', authMiddleware, async (c) => {
  const userId = c.get('user').sub
  const body = await c.req.json()
  try {
    const size = new TextEncoder().encode(JSON.stringify(body)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const key = await getDataKey(c.env)
  const payload = key ? await encryptJson(body, key) : body
  await c.env.DB.prepare(
    'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
  )
    .bind(userId, JSON.stringify(payload))
    .run()
  return c.json({ success: true })
})

// Accept POST for sendBeacon merge (treated like PATCH/merge)
app.post('/api/user/data', authMiddleware, async (c) => {
  const userId = c.get('user').sub
  const patch = await c.req.json()
  try {
    const size = new TextEncoder().encode(JSON.stringify(patch)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const row = await c.env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const raw = row ? JSON.parse(row.data) : {}
  const key = await getDataKey(c.env)
  const current = key ? await decryptJson(raw, key) : raw
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete current[k]
    else current[k] = v
  }
  const payload = key ? await encryptJson(current, key) : current
  await c.env.DB.prepare(
    'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
  )
    .bind(userId, JSON.stringify(payload))
    .run()
  return c.json({ success: true })
})

// Merge-only updates: accepts a partial JSON object; null values delete keys.
app.patch('/api/user/data', authMiddleware, async (c) => {
  const userId = c.get('user').sub
  const patch = await c.req.json()
  try {
    const size = new TextEncoder().encode(JSON.stringify(patch)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const row = await c.env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const raw = row ? JSON.parse(row.data) : {}
  const key = await getDataKey(c.env)
  const current = key ? await decryptJson(raw, key) : raw
  // Apply patch: set keys; if value is null, delete the key
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete current[k]
    else current[k] = v
  }
  const payload = key ? await encryptJson(current, key) : current
  await c.env.DB.prepare(
    'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
  )
    .bind(userId, JSON.stringify(payload))
    .run()
  return c.json({ success: true })
})

// Static asset caching with Cache-Control + edge cache
app.use('*', async (c) => {
  const url = new URL(c.req.url)
  const p = url.pathname

  const isJson = (
    p === '/song-meta.json' ||
    p === '/radar-values.json' ||
    p === '/dan-data.json' ||
    p === '/vega-data.json' ||
    p === '/vega-results.json' ||
    p === '/sm-files.json'
  )
  const isLogo = p.startsWith('/img/logos/') && (p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.webp'))
  const isJacket = p.startsWith('/sm/') && (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.webp'))
  const isFingerprintedAsset = p.startsWith('/assets/')

  const cacheable = isJson || isLogo || isJacket || isFingerprintedAsset

  if (!cacheable) {
    return await c.env.ASSETS.fetch(c.req.raw)
  }

  const cache = caches.default
  const cached = await cache.match(c.req.raw)
  if (cached) return cached

  // Fetch from R2/ASSETS then add Cache-Control
  const originRes = await c.env.ASSETS.fetch(c.req.raw)
  const headers = new Headers(originRes.headers)

  if (isJson) {
    // static JSON generated at build-time; refresh daily and allow SWR
    headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400')
  } else if (isLogo || isJacket || isFingerprintedAsset) {
    // images and fingerprinted assets: long cache, immutable
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  }

  // Normalize content-type for known JSON if not already set
  if (isJson && !headers.get('content-type')) headers.set('Content-Type', 'application/json; charset=utf-8')

  const res = new Response(originRes.body, { status: originRes.status, headers })
  try { c.executionCtx?.waitUntil(cache.put(c.req.raw, res.clone())) } catch { /* ignore cache put errors */ }
  return res
})

export default app
// Compute OGG Vorbis duration from asset bytes (on-demand, cached at edge)
app.get('/api/song-length', async (c) => {
  try {
    const smPath = c.req.query('smPath') || '' // e.g., sm/A20/Ace out/Ace out.sm
    const music = c.req.query('music') || ''   // e.g., Ace out.ogg
    if (!smPath || !music) return c.json({ error: 'smPath and music required' }, 400)

    // Build absolute asset path
    const lastSlash = smPath.lastIndexOf('/')
    if (lastSlash < 0) return c.json({ error: 'invalid smPath' }, 400)
    const folder = smPath.slice(0, lastSlash)
    const audioPath = `/${folder}/${music}`

    const cache = caches.default
    const cacheKey = new Request(new URL(`/api/song-length?smPath=${encodeURIComponent(smPath)}&music=${encodeURIComponent(music)}`, c.req.url), c.req)
    const cached = await cache.match(cacheKey)
    if (cached) return cached

    // Helpers
    const fetchBytes = async (method, range) => {
      const url = new URL(audioPath, c.req.url)
      const req = new Request(url.toString(), { method, headers: range ? { Range: range } : {} })
      const res = await c.env.ASSETS.fetch(req)
      return res
    }

    // Try HEAD for Content-Length
    let size = 0
    try {
      const head = await fetchBytes('HEAD')
      const len = head.headers.get('content-length')
      size = len ? parseInt(len, 10) : 0
    } catch { /* ignore */ }

    const FIRST_CHUNK = 64 * 1024
    const LAST_CHUNK = 64 * 1024

    // Fetch first chunk to get Vorbis sample rate
    let firstRes = await fetchBytes('GET', `bytes=0-${FIRST_CHUNK - 1}`)
    if (firstRes.status === 416) firstRes = await fetchBytes('GET') // no range support
    const firstBuf = await firstRes.arrayBuffer()

    // Find identification header [0x01,'vorbis'] and read sample rate (LE uint32 at offset +12)
    const firstArr = new Uint8Array(firstBuf)
    const pat = [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]
    const findPattern = (arr, pattern) => {
      outer: for (let i = 0; i <= arr.length - pattern.length; i++) {
        for (let j = 0; j < pattern.length; j++) if (arr[i + j] !== pattern[j]) continue outer
        return i
      }
      return -1
    }
    const pos = findPattern(firstArr, pat)
    if (pos < 0) return c.json({ error: 'not ogg/vorbis id header found' }, 422)
    const viewFirst = new DataView(firstBuf)
    const sampleRate = viewFirst.getUint32(pos + 12, true)
    if (!sampleRate) return c.json({ error: 'invalid sampleRate' }, 422)

    // Fetch last chunk to get last Ogg page granule position
    let lastBuf
    if (size > 0) {
      const start = Math.max(0, size - LAST_CHUNK)
      const lastRes = await fetchBytes('GET', `bytes=${start}-`)
      lastBuf = await lastRes.arrayBuffer()
    } else {
      // Range not available; fallback to full fetch (may be large)
      const fullRes = await fetchBytes('GET')
      lastBuf = await fullRes.arrayBuffer()
    }
    const lastArr = new Uint8Array(lastBuf)
    const findLastOggS = (arr) => {
      for (let i = arr.length - 4; i >= 0; i--) {
        if (arr[i] === 0x4f && arr[i + 1] === 0x67 && arr[i + 2] === 0x67 && arr[i + 3] === 0x53) return i
      }
      return -1
    }
    const oggPos = findLastOggS(lastArr)
    if (oggPos < 0) return c.json({ error: 'no OggS header at end' }, 422)
    const viewLast = new DataView(lastBuf)
    const granule = Number(viewLast.getBigUint64(oggPos + 6, true)) // LE uint64
    if (!isFinite(granule) || granule <= 0) return c.json({ error: 'invalid granule' }, 422)

    const seconds = granule / sampleRate
    const body = JSON.stringify({ seconds, roundedSeconds: Math.round(seconds), sampleRate, granule })
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=604800' })
    const res = new Response(body, { status: 200, headers })
    try { c.executionCtx?.waitUntil(cache.put(cacheKey, res.clone())) } catch { /* ignore */ }
    return res
  } catch (e) {
    return c.json({ error: 'failed', message: String(e) }, 500)
  }
})
