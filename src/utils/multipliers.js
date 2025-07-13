// src/utils/multipliers.js

/**
 * Generates an array of numbers within a range with a specific step.
 * This version is more robust against floating-point inaccuracies than
 * calculating the length beforehand.
 * @param {number} start - The starting number.
 * @param {number} end - The ending number (inclusive).
 * @param {number} step - The increment step.
 * @returns {number[]} - The array of numbers.
 */
const range = (start, end, step) => {
    const result = [];
    // Use a small epsilon for safer floating-point comparisons
    const epsilon = 1e-9;
    let current = start;
    while (current <= end + epsilon) {
        result.push(current);
        current += step;
    }
    return result;
};

export const MULTIPLIER_MODES = {
    MAX_SN: 'DDR MAX - Supernova',
    SN2: 'DDR Supernova 2',
    X_A: 'DDR X - A (Offline)',
    A_A3: 'DDR A - A3 (Online)',
    WORLD: 'DDR World',
};

/**
 * Generates the array of speed multipliers based on the selected mode.
 * @param {string} mode - The multiplier mode (e.g., MULTIPLIER_MODES.ONLINE).
 * @returns {number[]} - The array of multiplier values.
 */
export const getMultipliers = (mode) => {
    switch (mode) {
        case MULTIPLIER_MODES.MAX_SN:
            return [1, 1.5, 2, 3, 5, 8];
        case MULTIPLIER_MODES.SN2:
            return [0.25, 0.5, 1, 1.5, 2, 3, 5, 8];
        case MULTIPLIER_MODES.X_A:
            return [0.25, 0.5, ...range(1, 8, 0.5)];
        case MULTIPLIER_MODES.A_A3:
            return [0.25, 0.5, ...range(1, 4, 0.25), ...range(4.5, 8, 0.5)];
        case MULTIPLIER_MODES.WORLD:
            return range(0.25, 8, 0.05).map(m => parseFloat(m.toFixed(2)));
        default:
            // Default to WORLD for broadest compatibility
            return range(0.25, 8, 0.05).map(m => parseFloat(m.toFixed(2)));
    }
};