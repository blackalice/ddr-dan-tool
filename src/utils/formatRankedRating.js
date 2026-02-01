export const formatRankedRating = (rating) => {
  if (rating == null || Number.isNaN(rating)) return '';
  const normalized = Math.round(Number(rating) * 100) / 100;
  const text = normalized.toString();
  return text.includes('.') ? text : `${text}.0`;
};
