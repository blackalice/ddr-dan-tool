const parseFilterNumber = (value) => {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return { value: numeric, isInteger: Number.isInteger(numeric) };
};

export const getDifficultyValue = (chart, showRankedRatings) => {
  if (!chart) return null;
  if (showRankedRatings && chart.rankedRating != null) {
    const ranked = Number(chart.rankedRating);
    if (Number.isFinite(ranked)) return ranked;
  }
  const feetValue = chart.feet ?? chart.level;
  const feet = Number(feetValue);
  return Number.isFinite(feet) ? feet : null;
};

export const getDifficultyBucketValue = (chart, showRankedRatings) => {
  const value = getDifficultyValue(chart, showRankedRatings);
  if (!Number.isFinite(value)) return null;
  return showRankedRatings ? Math.floor(value) : value;
};

export const isDifficultyInRange = (value, minRaw, maxRaw, showRankedRatings) => {
  const min = parseFilterNumber(minRaw);
  const max = parseFilterNumber(maxRaw);
  if (!min && !max) return true;
  if (!Number.isFinite(value)) return false;
  if (min) {
    if (showRankedRatings && min.isInteger) {
      if (Math.floor(value) < min.value) return false;
    } else if (value < min.value) {
      return false;
    }
  }
  if (max) {
    if (showRankedRatings && max.isInteger) {
      if (Math.floor(value) > max.value) return false;
    } else if (value > max.value) {
      return false;
    }
  }
  return true;
};

export const isRankedFractionInRange = (value, minRaw, maxRaw, showRankedRatings) => {
  if (!showRankedRatings) return true;
  const min = parseFilterNumber(minRaw);
  const max = parseFilterNumber(maxRaw);
  if (!min && !max) return true;
  if (!Number.isFinite(value)) return false;
  const fraction = value - Math.floor(value);
  if (min && fraction < min.value - 1e-9) return false;
  if (max && fraction > max.value + 1e-9) return false;
  return true;
};

export const isDifficultyAllowed = (
  value,
  minRaw,
  maxRaw,
  showRankedRatings,
  rankedFractionMinRaw,
  rankedFractionMaxRaw,
) => {
  if (!isDifficultyInRange(value, minRaw, maxRaw, showRankedRatings)) return false;
  return isRankedFractionInRange(value, rankedFractionMinRaw, rankedFractionMaxRaw, showRankedRatings);
};
