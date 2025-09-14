export function makeScoreKey({ title, artist, difficulty }) {
  if (!title || !difficulty) return null;
  const t = String(title).toLowerCase();
  const d = String(difficulty).toLowerCase();
  if (artist) {
    const a = String(artist).toLowerCase();
    return `${t}::${a}::${d}`;
  }
  // Legacy format (no artist)
  return `${t}-${d}`;
}

export function legacyScoreKey({ title, difficulty }) {
  if (!title || !difficulty) return null;
  const t = String(title).toLowerCase();
  const d = String(difficulty).toLowerCase();
  return `${t}-${d}`;
}

export function resolveScore(scores, mode, { title, difficulty, artist }) {
  if (!scores || !mode || !title || !difficulty) return null;
  const byMode = scores[mode] || {};
  // Try explicit keys first
  const keyNew = makeScoreKey({ title, artist, difficulty });
  const keyLegacy = legacyScoreKey({ title, difficulty });
  if (keyNew && byMode[keyNew]) return byMode[keyNew];
  if (byMode[keyLegacy]) return byMode[keyLegacy];
  // Fallback: scan artist-aware keys that match title + difficulty
  const t = String(title).toLowerCase();
  const d = String(difficulty).toLowerCase();
  let found = null;
  for (const [k, val] of Object.entries(byMode)) {
    // Match either legacy form or artist-aware form
    if (k === `${t}-${d}`) { found = val; break; }
    // artist-aware form pattern: `${t}::${artist}::${d}`
    if (k.startsWith(`${t}::`) && k.endsWith(`::${d}`)) {
      found = val;
      // do not break to allow last one to win; but one is fine
      break;
    }
  }
  return found;
}
