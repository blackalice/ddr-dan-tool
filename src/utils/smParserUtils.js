import Fraction from "fraction.js";

const beats = [
  new Fraction(1).div(4),
  new Fraction(1).div(6),
  new Fraction(1).div(8),
  new Fraction(1).div(12),
  new Fraction(1).div(16),
];

export function determineBeat(offset) {
  const match = beats.find((b) => offset.mod(b).n === 0);

  if (!match) {
    return 6;
  }

  return match.d;
}

export const normalizedDifficultyMap = {
  beginner: "beginner",
  easy: "basic",
  basic: "basic",
  trick: "difficult",
  another: "difficult",
  medium: "difficult",
  difficult: "expert",
  expert: "expert",
  maniac: "expert",
  ssr: "expert",
  hard: "expert",
  challenge: "challenge",
  smaniac: "challenge",
  edit: "edit",
};

function similarBpm(a, b) {
  return Math.abs(a.bpm - b.bpm) < 1;
}

export function mergeSimilarBpmRanges(bpm) {
  if (!Array.isArray(bpm) || bpm.length === 0) return [];

  const merged = [{ ...bpm[0] }];
  for (let i = 1; i < bpm.length; i += 1) {
    const current = bpm[i];
    const last = merged[merged.length - 1];

    if (last && similarBpm(last, current)) {
      // Extend the active segment across the full similar-BPM chain.
      last.endOffset = current.endOffset;
      continue;
    }

    merged.push({ ...current });
  }
  return merged;
}
