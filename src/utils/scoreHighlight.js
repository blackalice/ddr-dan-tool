export const SCORE_HIGHLIGHT_THRESHOLD = 989999;

export function shouldHighlightScore(score) {
  if (score == null) return false;
  const numeric = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numeric)) return false;
  return numeric > SCORE_HIGHLIGHT_THRESHOLD;
}

const LAMP_GLOW_CLASS_MAP = [
  { match: 'marvelous', className: 'glow-marvelous' },
  { match: 'perfect', className: 'glow-perfect' },
  { match: 'great', className: 'glow-great' },
  { match: 'good', className: 'glow-good' },
];

export function getLampGlowClass(lamp) {
  if (!lamp) return '';
  const normalized = String(lamp).toLowerCase();
  const entry = LAMP_GLOW_CLASS_MAP.find(({ match }) => normalized.includes(match));
  return entry ? entry.className : '';
}

export function getScoreGlowClasses({
  lamp,
  includeLamp = true,
} = {}) {
  if (!includeLamp) return '';
  const lampClass = getLampGlowClass(lamp);
  return lampClass || '';
}
