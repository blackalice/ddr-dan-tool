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
    // didn't find anything? then it's a weirdo like a 5th note or 32nd note, they get colored
    // the same as 6ths
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
  // TODO: filter edits out altogether
  edit: "edit",
};

function similarBpm(a, b) {
  return Math.abs(a.bpm - b.bpm) < 1;
}

export function mergeSimilarBpmRanges(bpm) {
  return bpm.reduce((building, b, i, a) => {
    const prev = a[i - 1];
    const next = a[i + 1];

    if (prev && similarBpm(prev, b)) {
      // this bpm was merged on the last iteration, so skip it
      return building;
    }

    if (next && similarBpm(next, b)) {
      return building.concat({
        ...b,
        endOffset: next.endOffset,
      });
    }

    return building.concat(b);
  }, []);
}
