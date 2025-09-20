import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { SignJWT } from 'jose'
import { parseGanymedeHtml } from './src/utils/parseGanymedeHtml.js'
import authApp, { authMiddleware } from './src/auth/index.js'

const app = new Hono()
const textEncoder = new TextEncoder()

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

function toB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (arr.length === 0) return ''
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    const slice = arr.subarray(i, i + chunk)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}
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

function parseStoredPayload(row) {
  if (!row) return {}
  const raw = row.data
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch (err) {
      console.warn('[user-data] stored JSON malformed', err)
      return {}
    }
  }
  if (typeof raw === 'object') return raw
  return {}
}

// Mount auth routes under /api (e.g., /api/login, /api/signup, /api/refresh, /api/logout)
app.route('/api', authApp)

app.get('/api/hello', (c) => c.json({ message: 'Hello from Hono!' }))

// Minimal environment/bindings diagnostics (no secret values exposed)
app.get('/api/env-check', (c) => {
  const env = (c.env?.ENV || '').toString()
  const hasJWT_SECRET = Boolean(c.env?.JWT_SECRET)
  const hasDATA_KEY = Boolean(c.env?.DATA_KEY)
  const hasDB = Boolean(c.env?.DB)
  const allowBearer = (c.env?.ALLOW_BEARER || '').toLowerCase() === 'true'
  const staticOriginConfigured = typeof c.env?.STATIC_ORIGIN === 'string' && c.env.STATIC_ORIGIN.length > 0
  return c.json({ env, hasJWT_SECRET, hasDATA_KEY, hasDB, allowBearer, staticOriginConfigured })
})

// Explicit refresh route to avoid any sub-app mounting quirks
app.post('/api/refresh', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!c.env.JWT_SECRET) {
    console.error('[auth] missing JWT_SECRET in environment (refresh)')
    return c.json({ error: 'Server misconfiguration' }, 500)
  }
  try {
    const row = await c.env.DB.prepare('SELECT COALESCE(token_version, 1) AS token_version FROM users WHERE id = ?')
      .bind(user.sub).first()
    const tokenVersion = row?.token_version || 1
    const origin = new URL(c.req.url).origin
    const token = await new SignJWT({ sub: user.sub, email: user.email, iss: origin, aud: origin, ver: tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(textEncoder.encode(c.env.JWT_SECRET))

    const isProd = (c.env?.ENV || '').toLowerCase() === 'production'
    const secure = isProd || c.req.url.startsWith('https://')
    const cookieName = isProd ? '__Host-token' : 'token'
    setCookie(c, cookieName, token, {
      httpOnly: true,
      secure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return c.json({ success: true })
  } catch (e) {
    console.error('[auth] refresh error', String(e))
    return c.json({ error: 'Server error' }, 500)
  }
})

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
  const user = c.get('user') || {}
  const email = user.email
  const userId = user.sub
  const fallback = { email }

  try {
    const db = c.env?.DB
    if (!db) {
      console.warn('[user-data] DB binding missing')
      return c.json(fallback, 503)
    }

    const row = await db.prepare('SELECT data FROM user_data WHERE user_id = ?')
      .bind(userId)
      .first()

    if (!row || row.data == null) {
      return c.json(fallback)
    }

    const key = await getDataKey(c.env)
    const raw = parseStoredPayload(row)
    let payload = raw
    if (key) {
      try {
        payload = await decryptJson(raw, key)
      } catch (err) {
        console.error('[user-data] decrypt failed', err)
        return c.json(fallback, 503)
      }
    }
    if (!payload || typeof payload !== 'object') {
      return c.json(fallback)
    }
    return c.json({ ...fallback, ...payload })
  } catch (err) {
    console.error('[user-data] fetch failed', err)
    return c.json(fallback, 503)
  }
})

app.put('/api/user/data', authMiddleware, async (c) => {
  const userId = c.get('user').sub
  const body = await c.req.json()
  const db = c.env?.DB
  if (!db) {
    console.warn('[user-data] DB binding missing (PUT)')
    return c.json({ error: 'Storage unavailable' }, 503)
  }
  try {
    const size = new TextEncoder().encode(JSON.stringify(body)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const key = await getDataKey(c.env)
  let payload = body
  if (key) {
    try {
      payload = await encryptJson(body, key)
    } catch (err) {
      console.error('[user-data] encrypt failed (PUT)', err)
      return c.json({ error: 'Encrypt failed' }, 500)
    }
  }
  await db.prepare(
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
  const db = c.env?.DB
  if (!db) {
    console.warn('[user-data] DB binding missing (POST)')
    return c.json({ error: 'Storage unavailable' }, 503)
  }
  try {
    const size = new TextEncoder().encode(JSON.stringify(patch)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const row = await db.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const raw = parseStoredPayload(row)
  const key = await getDataKey(c.env)
  let current = raw
  if (key) {
    try {
      current = await decryptJson(raw, key)
    } catch (err) {
      console.error('[user-data] decrypt failed (POST)', err)
      current = {}
    }
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete current[k]
    else current[k] = v
  }
  let payload = current
  if (key) {
    try {
      payload = await encryptJson(current, key)
    } catch (err) {
      console.error('[user-data] encrypt failed (POST)', err)
      return c.json({ error: 'Encrypt failed' }, 500)
    }
  }
  await db.prepare(
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
  const db = c.env?.DB
  if (!db) {
    console.warn('[user-data] DB binding missing (PATCH)')
    return c.json({ error: 'Storage unavailable' }, 503)
  }
  try {
    const size = new TextEncoder().encode(JSON.stringify(patch)).length
    if (size > MAX_USER_DATA_BYTES) return c.json({ error: 'Payload too large' }, 413)
  } catch { /* ignore size calc errors */ }
  const row = await db.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const raw = parseStoredPayload(row)
  const key = await getDataKey(c.env)
  let current = raw
  if (key) {
    try {
      current = await decryptJson(raw, key)
    } catch (err) {
      console.error('[user-data] decrypt failed (PATCH)', err)
      current = {}
    }
  }
  // Apply patch: set keys; if value is null, delete the key
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete current[k]
    else current[k] = v
  }
  let payload = current
  if (key) {
    try {
      payload = await encryptJson(current, key)
    } catch (err) {
      console.error('[user-data] encrypt failed (PATCH)', err)
      return c.json({ error: 'Encrypt failed' }, 500)
    }
  }
  await db.prepare(
    'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
  )
    .bind(userId, JSON.stringify(payload))
    .run()
  return c.json({ success: true })
})

// Static asset caching with Cache-Control + edge cache
// Note: Static assets are now served by Cloudflare Pages.
// This Worker intentionally handles only /api/* routes.

export default app
// Serve precomputed song lengths (built during predeploy) from static JSON
let cachedSongLengths = null
let cachedFetchedAt = 0
async function getSongLengths(c) {
  const now = Date.now()
  if (cachedSongLengths && (now - cachedFetchedAt < 6 * 60 * 60 * 1000)) return cachedSongLengths
  const staticOrigin = (c.env?.STATIC_ORIGIN && c.env.STATIC_ORIGIN.trim()) || new URL(c.req.url).origin
  const url = new URL('/song-lengths.json', staticOrigin)
  const res = await fetch(url.toString(), { method: 'GET' })
  if (!res.ok) throw new Error(`song-lengths.json fetch failed: ${res.status}`)
  const data = await res.json()
  cachedSongLengths = data || {}
  cachedFetchedAt = now
  return cachedSongLengths
}

app.get('/api/song-length', async (c) => {
  try {
    const smPath = c.req.query('smPath') || '' // e.g., sm/A20/Ace out/Ace out.sm
    if (!smPath) return c.json({ error: 'smPath required' }, 400)
    const cache = caches.default
    const cacheKey = new Request(new URL(`/api/song-length?smPath=${encodeURIComponent(smPath)}`, c.req.url), c.req)
    const hit = await cache.match(cacheKey)
    if (hit) return hit

    const map = await getSongLengths(c)
    const entry = map[smPath]
    if (!entry) return c.json({ error: 'not found' }, 404)
    const seconds = Number(entry.seconds || entry.roundedSeconds || 0)
    const body = JSON.stringify({ seconds, roundedSeconds: Math.round(seconds) })
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=604800' })
    const res = new Response(body, { status: 200, headers })
    try { c.executionCtx?.waitUntil(cache.put(cacheKey, res.clone())) } catch { /* ignore */ }
    return res
  } catch (e) {
    return c.json({ error: 'failed', message: String(e) }, 500)
  }
})

// Minimal DB diagnostics to verify schema without exposing data
app.get('/api/db-check', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) return c.json({ hasDB: false })
    const tbls = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
    const names = new Set((tbls?.results || tbls?.rows || []).map((r) => r.name || r[0]).filter(Boolean))
    const usersInfo = await db.prepare('PRAGMA table_info(users)').all().catch(() => ({ results: [] }))
    const userCols = new Set((usersInfo?.results || usersInfo?.rows || []).map((r) => r.name || r[1]).filter(Boolean))
    const hasUsers = names.has('users')
    const hasUserData = names.has('user_data')
    const hasRate = names.has('rate_limits')
    const hasTokenVersion = userCols.has('token_version')
    return c.json({ hasDB: true, hasUsers, hasUserData, hasRate, hasTokenVersion })
  } catch (e) {
    return c.json({ error: 'db-check failed', message: String(e) }, 500)
  }
})
