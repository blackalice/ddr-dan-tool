export const SONG_ID_LENGTH = 6;
const NORMALIZED_SONG_ID_REGEX = /^\d{6}$/;

export function formatSongIdNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Invalid song id number: ${value}`);
  }
  return String(Math.trunc(numeric)).padStart(SONG_ID_LENGTH, '0');
}

export function normalizeSongIdValue(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  let digits = null;
  if (/^SONG-\d+$/i.test(raw)) {
    digits = raw.slice(5);
  } else if (/^\d+$/.test(raw)) {
    digits = raw;
  } else {
    return null;
  }
  const numeric = Number.parseInt(digits, 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return String(numeric).padStart(SONG_ID_LENGTH, '0');
}

export function extractSongNumericId(songId) {
  const normalized = normalizeSongIdValue(songId);
  if (!normalized) return 0;
  return Number.parseInt(normalized, 10);
}

export function isNormalizedSongId(value) {
  return typeof value === 'string' && NORMALIZED_SONG_ID_REGEX.test(value);
}
