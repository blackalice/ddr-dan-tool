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

app.use('*', async (c) => {
  const resp = await c.env.ASSETS.fetch(c.req.raw)
  return resp
})

export default app
