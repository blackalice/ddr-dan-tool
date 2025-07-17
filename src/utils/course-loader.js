// Fetches the pre-processed Dan course data.
const BASE = import.meta.env.BASE_URL

export const loadDanData = async () => {
    try {
        const response = await fetch(`${BASE}dan-data.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
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
        const response = await fetch(`${BASE}vega-data.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Loaded pre-processed Vega course data.");
        return data;
    } catch (error) {
        console.error("Error fetching pre-processed Vega course data:", error);
        return {};
    }
};

