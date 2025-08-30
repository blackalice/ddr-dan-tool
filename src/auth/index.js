import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { SignJWT, jwtVerify } from 'jose'

const authApp = new Hono()

const textEncoder = new TextEncoder()

// Password hashing via PBKDF2 (Worker-friendly)
const PBKDF2_ITERATIONS = 150000
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

async function verifyPasswordPBKDF2(password, encoded) {
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = parseInt(parts[1], 10)
  const salt = fromBase64(parts[2])
  const expectedHash = parts[3]
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
  const actualHash = toBase64(bits)
  return actualHash === expectedHash
}

async function ensureUsersTable(c) {
  // Ensure table exists; add columns if missing (ignore errors if they already exist)
  await c.env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)').run();
  await c.env.DB.prepare('ALTER TABLE users ADD COLUMN email TEXT').run().catch(() => {});
  await c.env.DB.prepare('ALTER TABLE users ADD COLUMN password_hash TEXT').run().catch(() => {});
  await c.env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)').run().catch(() => {});
}

authApp.post('/signup', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  await ensureUsersTable(c)

  const encoded = await hashPasswordPBKDF2(password)

  try {
    console.log('[auth] signup attempt', { email })
    await c.env.DB.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
      .bind(email, encoded)
      .run()
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      console.warn('[auth] signup duplicate email', { email })
      return c.json({ error: 'Email already registered' }, 400)
    }
    console.error('[auth] signup error', { email, error: String(err?.message || err) })
    throw err
  }

  return c.json({ success: true })
})

authApp.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  await ensureUsersTable(c)

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash FROM users WHERE email = ?'
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

  const token = await new SignJWT({ sub: user.id, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(textEncoder.encode(c.env.JWT_SECRET))

  const secure = c.req.url.startsWith('https://')

  setCookie(c, 'token', token, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
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

  const token = await new SignJWT({ sub: user.sub, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(textEncoder.encode(c.env.JWT_SECRET))

  const secure = c.req.url.startsWith('https://')

  setCookie(c, 'token', token, {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
  })

  return c.json({ success: true })
})

authApp.post('/logout', (c) => {
  const secure = c.req.url.startsWith('https://')
  setCookie(c, 'token', '', {
    httpOnly: true,
    secure,
    sameSite: 'Strict',
    path: '/',
    maxAge: 0,
  })
  return c.json({ success: true })
})

export const authMiddleware = async (c, next) => {
  const bearer = c.req.header('Authorization')
  const token = getCookie(c, 'token') || bearer?.replace('Bearer ', '')

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const secret = textEncoder.encode(c.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    c.set('user', payload)
    return next()
  } catch {
    console.debug('[auth] jwt verification failed')
    return c.json({ error: 'Unauthorized' }, 401)
  }
}

export default authApp

