import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const generated = [
  'assets',
  'index.html',
  'registerSW.js',
  'sw.js',
  'sw.js.map',
  'workbox-*.js',
  'workbox-*.js.map',
]

await fs.mkdir(dist, { recursive: true })
const entries = await fs.readdir(dist).catch(() => [])
for (const pattern of generated) {
  const matcher = new RegExp(`^${pattern.replaceAll('.', '\\.').replaceAll('*', '.*')}$`)
  for (const entry of entries) {
    if (matcher.test(entry)) {
      await fs.rm(path.join(dist, entry), { recursive: true, force: true })
    }
  }
}
