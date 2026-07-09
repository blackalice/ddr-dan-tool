import { promises as fs } from 'node:fs'
import path from 'node:path'

async function walk(root) {
  const files = new Map()
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile()) files.set(path.relative(root, full).replaceAll('\\', '/'), full)
    }
  }
  return files
}

async function readManifest(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return { files: {} }
  }
}

export async function syncTree({ source, destination, manifestPath, include = () => true }) {
  const previous = await readManifest(manifestPath)
  const sourceFiles = await walk(source)
  const next = { version: 1, files: {} }
  let copied = 0
  let removed = 0
  let bytes = 0

  await fs.mkdir(destination, { recursive: true })
  for (const [relative, sourcePath] of sourceFiles) {
    if (!include(sourcePath, relative)) continue
    const stat = await fs.stat(sourcePath)
    const signature = `${stat.size}:${stat.mtimeMs}`
    next.files[relative] = signature
    const destinationPath = path.join(destination, relative)
    const destinationExists = await fs.access(destinationPath).then(() => true).catch(() => false)
    if (previous.files?.[relative] !== signature || !destinationExists) {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true })
      await fs.copyFile(sourcePath, destinationPath)
      copied += 1
      bytes += stat.size
    }
  }

  for (const relative of Object.keys(previous.files || {})) {
    if (!(relative in next.files)) {
      await fs.rm(path.join(destination, relative), { force: true })
      removed += 1
    }
  }
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(next, null, 2))
  return { copied, removed, bytes, total: Object.keys(next.files).length }
}
