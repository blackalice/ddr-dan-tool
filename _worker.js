import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';

const app = new Hono();


// Middleware for handling CORS and OPTIONS requests
app.use('/api/*', async (c, next) => {
  c.res.headers.set('Access-Control-Allow-Origin', '*');
  c.res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (c.req.method === 'OPTIONS') return c.text('');
  await next();
});

// --- API Routes ---

app.post('/api/register', async c => {
  const { username, email, password } = await c.req.json();
  if (!username || !email || !password) return c.json({ error: 'invalid' }, 400);

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await c.env.DB.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').bind(username, email, hash).run();
    const id = result.meta.last_row_id;
    // Reads the secret from the environment instead of a hardcoded constant
    const token = await sign({ id, username, email }, c.env.JWT_SECRET);
    return c.json({ token });
  } catch {
    return c.json({ error: 'user exists' }, 400);
  }
});

app.post('/api/login', async c => {
  const { username, password } = await c.req.json();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ? OR email = ?').bind(username, username).first();
  if (!user) return c.json({ error: 'invalid' }, 400);

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return c.json({ error: 'invalid' }, 400);

  // Reads the secret from the environment
  const token = await sign({ id: user.id, username: user.username, email: user.email }, c.env.JWT_SECRET);
  return c.json({ token });
});

// Reusable function to verify the JWT from the Authorization header
const auth = async (c) => {
  const header = c.req.header('Authorization');
  if (!header) return null;

  const token = header.split(' ')[1];
  try {
    // Reads the secret from the environment
    return await verify(token, c.env.JWT_SECRET);
  } catch {
    return null;
  }
};

app.get('/api/user', async c => {
  const payload = await auth(c);
  if (!payload) return c.json({ error: 'unauthorized' }, 401);

  const settingsRow = await c.env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(payload.id).first();
  const listsRow = await c.env.DB.prepare('SELECT data FROM lists WHERE user_id = ?').bind(payload.id).first();

  return c.json({
    user: { username: payload.username, email: payload.email },
    settings: settingsRow ? JSON.parse(settingsRow.data) : null,
    lists: listsRow ? JSON.parse(listsRow.data) : null,
  });
});

app.post('/api/settings', async c => {
  const payload = await auth(c);
  if (!payload) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json();
  const data = JSON.stringify(body.settings);

  await c.env.DB.prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').bind(payload.id, data).run();
  return c.json({ ok: true });
});

app.post('/api/lists', async c => {
  const payload = await auth(c);
  if (!payload) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json();
  const data = JSON.stringify(body.lists);

  await c.env.DB.prepare('INSERT INTO lists (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').bind(payload.id, data).run();
  return c.json({ ok: true });
});

// Simple endpoint to test writing to the database
app.post('/api/test-db', async c => {
  try {
    const body = await c.req.json();
    const msg = body.message || 'test';
    const result = await c.env.DB.prepare('INSERT INTO test_entries (message) VALUES (?)').bind(msg).run();
    return c.json({ ok: true, meta: result.meta });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Fallback to serve static assets from the "dist" directory
app.use('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
