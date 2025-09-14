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

