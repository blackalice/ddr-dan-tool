import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import bcrypt from 'bcryptjs'

const app = new Hono()

const JWT_SECRET = 'ddr-toolkit-secret'

const initDB = async (db) => {
  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  );`)
  await db.exec(`CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    data TEXT
  );`)
  await db.exec(`CREATE TABLE IF NOT EXISTS lists (
    user_id INTEGER PRIMARY KEY,
    data TEXT
  );`)
}

app.get('/api/hello', (c) => c.json({ message: 'Hello from Hono!' }))

app.use('/api/*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', '*')
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (c.req.method === 'OPTIONS') return c.text('')
  await next()
})

app.post('/api/register', async c => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'invalid' }, 400)
  await initDB(c.env.DB)
  const hash = await bcrypt.hash(password, 10)
  try {
    const result = await c.env.DB.prepare('INSERT INTO users (username, password) VALUES (?, ?)').bind(username, hash).run()
    const id = result.meta.last_row_id
    const token = await sign({ id, username }, JWT_SECRET)
    return c.json({ token })
  } catch {
    return c.json({ error: 'user exists' }, 400)
  }
})

app.post('/api/login', async c => {
  const { username, password } = await c.req.json()
  await initDB(c.env.DB)
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first()
  if (!user) return c.json({ error: 'invalid' }, 400)
  const ok = await bcrypt.compare(password, user.password)
  if (!ok) return c.json({ error: 'invalid' }, 400)
  const token = await sign({ id: user.id, username }, JWT_SECRET)
  return c.json({ token })
})

const auth = async c => {
  const header = c.req.header('Authorization')
  if (!header) return null
  const token = header.split(' ')[1]
  try {
    return await verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

app.get('/api/user', async c => {
  const payload = await auth(c)
  if (!payload) return c.json({ error: 'unauthorized' }, 401)
  await initDB(c.env.DB)
  const settingsRow = await c.env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(payload.id).first()
  const listsRow = await c.env.DB.prepare('SELECT data FROM lists WHERE user_id = ?').bind(payload.id).first()
  return c.json({ user: { username: payload.username }, settings: settingsRow ? JSON.parse(settingsRow.data) : null, lists: listsRow ? JSON.parse(listsRow.data) : null })
})

app.post('/api/settings', async c => {
  const payload = await auth(c)
  if (!payload) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json()
  await initDB(c.env.DB)
  const data = JSON.stringify(body.settings)
  await c.env.DB.prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').bind(payload.id, data).run()
  return c.json({ ok: true })
})

app.post('/api/lists', async c => {
  const payload = await auth(c)
  if (!payload) return c.json({ error: 'unauthorized' }, 401)
  const body = await c.req.json()
  await initDB(c.env.DB)
  const data = JSON.stringify(body.lists)
  await c.env.DB.prepare('INSERT INTO lists (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').bind(payload.id, data).run()
  return c.json({ ok: true })
})

app.use('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
