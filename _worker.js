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

app.use('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
