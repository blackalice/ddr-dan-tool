// A simple data loader that fetches the pre-processed course data.
export const loadCourseData = async () => {
    try {
        const response = await fetch('/processed-data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Loaded pre-processed course data.");
        return data;
    } catch (error) {
        console.error("Error fetching pre-processed course data:", error);
        // Return a default structure in case of an error
        return { dan: { single: [], double: [] }, vega: [] };
    }
};

