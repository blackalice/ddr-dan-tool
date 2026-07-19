import { normalizeDifficultyName, normalizeMode } from './chartIds.js';

// A simfile path is the canonical identity of a song. Keep its case intact:
// deployed asset paths are case-sensitive and a case-only rename is meaningful.
export const normalizeSongKey = (value) => {
    const raw = String(value || '').replace(/\\/g, '/').trim();
    if (!raw) return '';
    const withoutLeadingSlash = raw.replace(/^\/+/, '');
    return withoutLeadingSlash.startsWith('sm/')
        ? withoutLeadingSlash
        : `sm/${withoutLeadingSlash}`;
};

export const buildChartKey = (songKey, mode, difficulty) => {
    const normalizedSongKey = normalizeSongKey(songKey);
    const normalizedMode = normalizeMode(mode);
    const normalizedDifficulty = normalizeDifficultyName(difficulty);
    if (!normalizedSongKey || !normalizedMode || !normalizedDifficulty) return '';
    return `${normalizedSongKey}#${normalizedMode}#${normalizedDifficulty}`;
};

export const getSongKey = (song) => normalizeSongKey(song?.songKey || song?.path);

export const getChartKey = (song, chart) =>
    chart?.chartKey || buildChartKey(getSongKey(song), chart?.mode, chart?.difficulty);
