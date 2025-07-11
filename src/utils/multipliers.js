// src/utils/multipliers.js

/**
 * Generates an array of numbers within a range with a specific step.
 * @param {number} start - The starting number.
 * @param {number} end - The ending number.
 * @param {number} step - The increment step.
 * @returns {number[]} - The array of numbers.
 */
const range = (start, end, step) => {
    const len = Math.floor((end - start) / step) + 1;
    return Array(len).fill().map((_, idx) => start + (idx * step));
};

export const MULTIPLIER_MODES = {
    ONLINE: 'DDR A-A3 (Online)',
    OFFLINE: 'DDR A-A3 (Offline)',
    WORLD: 'DDR World',
};

/**
 * Generates the array of speed multipliers based on the selected mode.
 * @param {string} mode - The multiplier mode (e.g., MULTIPLIER_MODES.ONLINE).
 * @returns {number[]} - The array of multiplier values.
 */
export const getMultipliers = (mode) => {
    switch (mode) {
        case MULTIPLIER_MODES.WORLD:
            // 0.05x increments from 0.05 to 8.0
            return range(0.05, 8.0, 0.05).map(m => parseFloat(m.toFixed(2)));
        case MULTIPLIER_MODES.OFFLINE:
            // 0.5x increments from 0.5 to 8.0
            return range(0.5, 8.0, 0.5);
        case MULTIPLIER_MODES.ONLINE:
        default:
            // Default: 0.25 up to 4.0, then 0.5 up to 8.0
            return [
                ...range(0.25, 4.0, 0.25),
                ...range(4.5, 8.0, 0.5),
            ];
    }
};
