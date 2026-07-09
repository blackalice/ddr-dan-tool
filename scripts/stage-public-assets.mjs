import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncTree } from './incremental-tree-sync.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const result = await syncTree({
  source: path.join(root, 'public'),
  destination: path.join(root, 'dist'),
  manifestPath: path.join(root, 'dist', '.public-assets-manifest.json'),
  include: (_source, relative) => relative !== '.public-assets-manifest.json',
})

console.log(`[stage-public-assets] ${result.copied} copied, ${result.removed} removed, ${(result.bytes / 1024 / 1024).toFixed(1)} MiB written (${result.total} files tracked)`)
