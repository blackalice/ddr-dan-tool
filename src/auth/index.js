import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { SignJWT, jwtVerify } from 'jose'

const authApp = new Hono()

const textEncoder = new TextEncoder()

// Basic input validation (top-level)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function isValidEmail(email) {
  if (typeof email !== 'string') return false
  if (email.length < 3 || email.length > 320) return false
  return EMAIL_RE.test(email)
}
function isValidPasswordForSignup(pw) {
  if (typeof pw !== 'string') return false
  // Minimum 8 chars; cap to prevent abuse
  return pw.length >= 8 && pw.length <= 1024
}

// Password hashing via PBKDF2 (Worker-friendly)
// Target ~300k+ iterations (tune based on latency budgets)
const PBKDF2_ITERATIONS = 310000
const PBKDF2_HASH_LEN_BITS = 256

const toBase64 = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const fromBase64 = (b64) => {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hashPasswordPBKDF2(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    PBKDF2_HASH_LEN_BITS
  )
  const hashB64 = toBase64(bits)
  const saltB64 = toBase64(salt)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltB64}$${hashB64}`
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function verifyPasswordPBKDF2(password, encoded) {
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = fromBase64(parts[2])
  const expectedBytes = fromBase64(parts[3])
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    PBKDF2_HASH_LEN_BITS
  )
  const actualBytes = new Uint8Array(bits)
  return constantTimeEqual(actualBytes, expectedBytes)
}

// Tables are managed via D1 migrations.

async function parseRequestBody(c) {
  const ct = (c.req.header('content-type') || '').toLowerCase()
  try {
    if (ct.includes('application/json')) {
      return await c.req.json()
    }
    if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await c.req.formData()
      const obj = {}
      for (const [k, v] of form.entries()) obj[k] = typeof v === 'string' ? v : (v?.name || '')
      return obj
    }
    // Fallback: try to parse raw text as JSON
    const text = await c.req.text()
    try { return JSON.parse(text) } catch { return {} }
  } catch {
    return {}
  }
}

async function sha256Base64(s) {
  const data = textEncoder.encode(s)
  const digest = await crypto.subtle.digest('SHA-256', data)
  let binary = ''
  const bytes = new Uint8Array(digest)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function checkRateLimit(c, key, limit, windowSeconds) {
  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const windowStart = nowSec - (nowSec % windowSeconds)
    const stmt = c.env.DB.prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN excluded.window_start = rate_limits.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = CASE WHEN excluded.window_start = rate_limits.window_start THEN rate_limits.window_start ELSE excluded.window_start END
       RETURNING count, window_start`
    ).bind(key, windowStart)
    const row = await stmt.first()
    if (!row) return true
    const count = typeof row.count === 'number' ? row.count : Number(row.count)
    return count <= limit
  } catch {
    // On errors, do not block auth
    return true
  }
}

async function verifyTurnstile(c, token) {
  const isProd = (c.env?.ENV || '').toLowerCase() === 'production'
  // Only enforce Turnstile in production by default
  if (!isProd) return true
  const secret = c.env?.TURNSTILE_SECRET
  if (!secret) return true
  if (!token) return false
  try {
    const ip = c.req.header('CF-Connecting-IP') || ''
    const body = new URLSearchParams()
    body.set('secret', secret)
    body.set('response', token)
    if (ip) body.set('remoteip', ip)
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const data = await resp.json()
    return !!data?.success
  } catch {
    return false
  }
}

export async function authMiddleware(c, next) {
  const allowBearer = (c.env?.ALLOW_BEARER || '').toLowerCase() === 'true'
  const bearer = allowBearer ? c.req.header('Authorization') : null
  const token = getCookie(c, '__Host-token') || getCookie(c, 'token') || (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null)

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const secret = textEncoder.encode(c.env.JWT_SECRET)
    const origin = new URL(c.req.url).origin
    // Prefer strict iss/aud checks; fall back once for legacy tokens
    let payload
    try {
      payload = (await jwtVerify(token, secret, { issuer: origin, audience: origin })).payload
    } catch {
      payload = (await jwtVerify(token, secret)).payload
    }
    // Enforce token version (logout-all)
    try {
      const row = await c.env.DB.prepare('SELECT COALESCE(token_version, 1) AS token_version FROM users WHERE id = ?')
        .bind(payload.sub).first()
      const currentVer = row?.token_version || 1
      if (payload.ver != null && payload.ver !== currentVer) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
    } catch { /* default allow on read error */ }
    c.set('user', payload)
    return next()
  } catch {
    console.debug('[auth] jwt verification failed')
    return c.json({ error: 'Unauthorized' }, 401)
  }
}

authApp.post('/signup', async (c) => {
  const body = await parseRequestBody(c)
  const rawEmail = body?.email
  const password = body?.password
  const turnstileToken = body?.turnstileToken
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }
  if (!isValidPasswordForSignup(password)) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  // Turnstile verification (if configured)
  const tsOk = await verifyTurnstile(c, turnstileToken)
  if (!tsOk) return c.json({ error: 'Human verification failed' }, 400)

  // Rate limits: signups per IP and per email
  try {
    const ip = c.req.header('CF-Connecting-IP') || ''
    const ipKey = `signup:ip:${await sha256Base64(ip)}`
    const emailKey = `signup:email:${email}`
    const okIp = await checkRateLimit(c, ipKey, 5, 10 * 60) // 5 per 10 minutes per IP
    const okEmail = await checkRateLimit(c, emailKey, 2, 60 * 60) // 2 per hour per email
    if (!okIp || !okEmail) return c.json({ error: 'Too many attempts, try later' }, 429)
  } catch { /* noop */ }

  const encoded = await hashPasswordPBKDF2(password)

  try {
    console.log('[auth] signup attempt', { email })
    await c.env.DB.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .bind(email, encoded)
      .run()
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      console.warn('[auth] signup duplicate email', { email })
      return c.json({ error: 'Signup failed' }, 400)
    }
    console.error('[auth] signup error', { email, error: String(err?.message || err) })
    return c.json({ error: 'Signup failed' }, 400)
  }

  return c.json({ success: true })
})

authApp.post('/login', async (c) => {
  const body = await parseRequestBody(c)
  const rawEmail = body?.email
  const password = body?.password
  const turnstileToken = body?.turnstileToken
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }
  if (!isValidEmail(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }

  // Turnstile (optional but recommended): if secret present, require passing
  const tsOk = await verifyTurnstile(c, turnstileToken)
  if (!tsOk) return c.json({ error: 'Human verification failed' }, 400)

  // Rate limit login by IP and email to deter brute force
  try {
    const ip = c.req.header('CF-Connecting-IP') || ''
    const ipKey = `login:ip:${await sha256Base64(ip)}`
    const emailKey = `login:email:${email}`
    const okIp = await checkRateLimit(c, ipKey, 20, 5 * 60) // 20 per 5 minutes per IP
    const okEmail = await checkRateLimit(c, emailKey, 5, 5 * 60) // 5 per 5 minutes per email
    if (!okIp || !okEmail) return c.json({ error: 'Too many attempts, try later' }, 429)
  } catch { /* noop */ }

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash, COALESCE(token_version, 1) AS token_version FROM users WHERE email = ?'
  ).bind(email).first()

  if (!user) {
    console.warn('[auth] login: user not found', { email })
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPasswordPBKDF2(password, user.password_hash)

  if (!valid) {
    console.warn('[auth] login: invalid password', { email })
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  if (!c.env.JWT_SECRET) {
    console.error('[auth] missing JWT_SECRET in environment')
    return c.json({ error: 'Server misconfiguration' }, 500)
  }

  // Add issuer/audience scoped to current origin
  const origin = new URL(c.req.url).origin
  const token = await new SignJWT({ sub: user.id, email, iss: origin, aud: origin, ver: user.token_version || 1 })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(textEncoder.encode(c.env.JWT_SECRET))

  // Optionally rehash with stronger iterations transparently
  try {
    const [ , itersStr ] = user.password_hash.split('$')
    const currIters = parseInt(itersStr, 10)
    if (Number.isFinite(currIters) && currIters < PBKDF2_ITERATIONS) {
      const upgraded = await hashPasswordPBKDF2(password)
      await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgraded, user.id).run()
    }
  } catch { /* noop */ }

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

  console.log('[auth] login success', { email })
  return c.json({ success: true })
})

authApp.post('/refresh', authMiddleware, async (c) => {
  const user = c.get('user')
  if (!c.env.JWT_SECRET) {
    console.error('[auth] missing JWT_SECRET in environment (refresh)')
    return c.json({ error: 'Server misconfiguration' }, 500)
  }

  // Refresh should use current token version from DB
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
})

authApp.post('/logout', (c) => {
  const isProd = (c.env?.ENV || '').toLowerCase() === 'production'
  const secure = isProd || c.req.url.startsWith('https://')
  // Clear both names to cover transition
  for (const name of ['token', '__Host-token']) {
    setCookie(c, name, '', {
      httpOnly: true,
      secure: name.startsWith('__Host-') ? true : secure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 0,
    })
  }
  return c.json({ success: true })
})
// Invalidate all sessions by bumping token_version
authApp.post('/logout-all', authMiddleware, async (c) => {
  const user = c.get('user')
  try {
    await c.env.DB.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?')
      .bind(user.sub).run()
  } catch { /* noop */ }
  const isProd = (c.env?.ENV || '').toLowerCase() === 'production'
  const secure = isProd || c.req.url.startsWith('https://')
  for (const name of ['token', '__Host-token']) {
    setCookie(c, name, '', {
      httpOnly: true,
      secure: name.startsWith('__Host-') ? true : secure,
      sameSite: 'Strict',
      path: '/',
      maxAge: 0,
    })
  }
  return c.json({ success: true })
})

export default authApp

