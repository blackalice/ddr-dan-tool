import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import argon2 from 'argon2-browser'
import { SignJWT, jwtVerify } from 'jose'

const authApp = new Hono()

const textEncoder = new TextEncoder()

authApp.post('/signup', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const { encoded } = await argon2.hash({
    pass: password,
    salt,
    type: argon2.ArgonType.Argon2id,
  })

  await c.env.DB.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
  ).bind(email, encoded).run()

  return c.json({ success: true })
})

authApp.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: 'Email and password required' }, 400)
  }

  const user = await c.env.DB.prepare(
    'SELECT id, password_hash FROM users WHERE email = ?'
  ).bind(email).first()

  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await argon2.verify({
    pass: password,
    encoded: user.password_hash,
    type: argon2.ArgonType.Argon2id,
  })

  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await new SignJWT({ sub: user.id, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(textEncoder.encode(c.env.JWT_SECRET))

  setCookie(c, 'token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  })

  return c.json({ success: true })
})

authApp.post('/refresh', authMiddleware, async (c) => {
  const user = c.get('user')
  const token = await new SignJWT({ sub: user.sub, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(textEncoder.encode(c.env.JWT_SECRET))

  setCookie(c, 'token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  })

  return c.json({ success: true })
})

authApp.post('/logout', (c) => {
  setCookie(c, 'token', '', {
    httpOnly: true,
    secure: true,
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
    return c.json({ error: 'Unauthorized' }, 401)
  }
}

export default authApp

