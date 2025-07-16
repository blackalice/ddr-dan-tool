export const getBpmRange = (bpm) => {
    if (typeof bpm !== 'string') return { min: 0, max: 0 };
    const parts = bpm.split('-').map(Number);
    if (parts.length === 1) return { min: parts[0], max: parts[0] };
    return { min: Math.min(...parts), max: Math.max(...parts) };
};
