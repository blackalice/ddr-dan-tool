// Fetches the pre-processed Dan course data.
import { getJsonCached } from './cachedFetch.js';

export const loadDanData = async () => {
    try {
        const data = await getJsonCached('/dan-data.json');
        console.log("Loaded pre-processed Dan course data.");
        return data;
    } catch (error) {
        console.error("Error fetching pre-processed Dan course data:", error);
        return { single: [], double: [] };
    }
};

// Fetches the pre-processed Vega course data.
export const loadVegaData = async () => {
    try {
        const data = await getJsonCached('/vega-data.json');
        console.log("Loaded pre-processed Vega course data.");
        return data;
    } catch (error) {
        console.error("Error fetching pre-processed Vega course data:", error);
        return {};
    }
};

// Fetches the pre-processed Vega ranking results.
export const loadVegaResults = async () => {
    try {
        const data = await getJsonCached('/vega-results.json');
        console.log("Loaded Vega ranking results.");
        return data;
    } catch (error) {
        console.error("Error fetching Vega ranking results:", error);
        return {};
    }
};

