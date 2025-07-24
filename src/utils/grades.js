export const getGrade = (score) => {
  if (score == null) return null;
  if (score >= 990000) return 'AAA';
  if (score >= 950000) return 'AA+';
  if (score >= 900000) return 'AA';
  if (score >= 890000) return 'AA-';
  if (score >= 850000) return 'A+';
  if (score >= 800000) return 'A';
  if (score >= 790000) return 'A-';
  if (score >= 750000) return 'B+';
  if (score >= 700000) return 'B';
  if (score >= 690000) return 'B-';
  if (score >= 650000) return 'C+';
  if (score >= 600000) return 'C';
  if (score >= 590000) return 'C-';
  if (score >= 550000) return 'D+';
  return 'D';
};
