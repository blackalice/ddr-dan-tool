import { Hono } from 'hono'

const app = new Hono()

app.get('/api/hello', (c) => c.json({ message: 'Hello from Hono!' }))

app.use('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
