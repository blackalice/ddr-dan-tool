import { promises as fs } from 'fs';
import path from 'path';

export const CACHE_VERSION = 1;
const DEFAULT_ROOT = process.cwd();

export const normalizePath = (p) => String(p || '').replace(/\\/g, '/');

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(dir, filter) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (filter && !filter(full, entry)) continue;
      out.push(full);
    }
  }
  return out;
}

export async function collectStats(paths, root = DEFAULT_ROOT) {
  const stats = {};
  for (const filePath of paths) {
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) continue;
      const rel = normalizePath(path.relative(root, filePath));
      stats[rel] = { mtimeMs: st.mtimeMs, size: st.size };
    } catch {
      // ignore missing paths
    }
  }
  return stats;
}

export async function collectTreeStats(root, filter, baseRoot = DEFAULT_ROOT) {
  if (!(await pathExists(root))) return {};
  const files = await walkFiles(root, filter);
  return collectStats(files, baseRoot);
}

export function mergeStats(...sets) {
  return Object.assign({}, ...sets);
}

export function statsEqual(a, b) {
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;
  aKeys.sort();
  bKeys.sort();
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    const aVal = a[aKeys[i]];
    const bVal = b[bKeys[i]];
    if (!aVal || !bVal) return false;
    if (aVal.mtimeMs !== bVal.mtimeMs || aVal.size !== bVal.size) return false;
  }
  return true;
}

async function readCache(cachePath) {
  try {
    const raw = await fs.readFile(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function shouldSkipBuild({ cachePath, inputStats, outputPaths = [], config = {}, force = false }) {
  if (force) return { skip: false, reason: 'forced' };
  for (const output of outputPaths) {
    if (!(await pathExists(output))) {
      return { skip: false, reason: 'missing-output' };
    }
  }
  const cached = await readCache(cachePath);
  if (!cached || cached.version !== CACHE_VERSION) return { skip: false, reason: 'no-cache' };
  if (!statsEqual(cached.inputs, inputStats)) return { skip: false, reason: 'inputs-changed' };
  if (JSON.stringify(cached.config || {}) !== JSON.stringify(config || {})) {
    return { skip: false, reason: 'config-changed' };
  }
  return { skip: true, reason: 'up-to-date' };
}

export async function writeCache(cachePath, inputStats, config = {}) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  const payload = {
    version: CACHE_VERSION,
    generatedAt: new Date().toISOString(),
    inputs: inputStats,
    config,
  };
  await fs.writeFile(cachePath, JSON.stringify(payload, null, 2));
}
