import { Hono } from 'hono'
import { parseGanymedeHtml } from './src/utils/parseGanymedeHtml.js'
import authApp, { authMiddleware } from './src/auth/index.js'

const app = new Hono()

app.route('/', authApp)

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

app.get('/user/data', authMiddleware, async (c) => {
  await c.env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS user_data (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL)'
  ).run()
  const userId = c.get('user').sub
  const row = await c.env.DB.prepare('SELECT data FROM user_data WHERE user_id = ?')
    .bind(userId)
    .first()
  const data = row ? JSON.parse(row.data) : {}
  return c.json(data)
})

app.put('/user/data', authMiddleware, async (c) => {
  await c.env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS user_data (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL)'
  ).run()
  const userId = c.get('user').sub
  const body = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO user_data (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data'
  )
    .bind(userId, JSON.stringify(body))
    .run()
  return c.json({ success: true })
})

app.use('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
