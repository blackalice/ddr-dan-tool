// Fetches the pre-processed Dan course data.
export const loadDanData = async () => {
    try {
        const response = await fetch('/dan-data.json');
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
        const response = await fetch('/vega-data.json');
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

// Fetches the pre-processed Vega ranking results.
export const loadVegaResults = async () => {
    try {
        const response = await fetch('/vega-results.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Loaded Vega ranking results.");
        return data;
    } catch (error) {
        console.error("Error fetching Vega ranking results:", error);
        return {};
    }
};

