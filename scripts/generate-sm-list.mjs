import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const smDir = path.join(__dirname, '..', 'public', 'sm');
const outputFile = path.join(__dirname, '..', 'public', 'sm-files.json');

function findSongFiles(dir, baseDir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            files = files.concat(findSongFiles(fullPath, baseDir));
        } else if (path.extname(fullPath) === '.sm' || path.extname(fullPath) === '.ssc') {
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            const content = fs.readFileSync(fullPath, 'utf-8');
            
            if (path.extname(fullPath) === '.ssc') {
                files.push(...parseSscFile(content, relativePath));
            } else {
                const title = content.match(/#TITLE:([^;]+);/)?.[1] || 'Unknown Title';
                const titleTranslit = content.match(/#TITLETRANSLIT:([^;]+);/)?.[1] || '';
                files.push({
                    path: relativePath,
                    title: title.trim(),
                    titleTranslit: titleTranslit.trim()
                });
            }
        }
    }
    return files;
}

try {
    const publicDir = path.join(__dirname, '..', 'public');
    const allFiles = findSongFiles(smDir, publicDir);
    
    // Dynamically get game folders from the 'sm' directory
    const allGameFolders = fs.readdirSync(smDir).filter(item => 
        fs.statSync(path.join(smDir, item)).isDirectory()
    );

    // Manual sort order for games
    const manualSortOrder = [
        'World', 'A3', 'A20 Plus', 'A20', 'A', '2014', '2013', 'X3 vs 2ndMix', 'X2', 'X', 
        'Supernova 2', 'Supernova', 'Extreme', '7thMix', '6thMix', '5thMix', '4thMix Plus', '4thMix', '3rdMix', '2ndMix', 'DDR'
    ];

    // Sort folders based on the manual order
    const gameFolders = allGameFolders.sort((a, b) => {
        const indexA = manualSortOrder.indexOf(a);
        const indexB = manualSortOrder.indexOf(b);

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB; // Both are in the manual list, sort by its order
        }
        if (indexA !== -1) {
            return -1; // Only A is in the list, it comes first
        }
        if (indexB !== -1) {
            return 1; // Only B is in the list, it comes first
        }
        return a.localeCompare(b); // Neither are in the list, sort alphabetically
    });

    const output = {
        games: gameFolders,
        files: allFiles
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    console.log(`Successfully generated sm-files.json with ${gameFolders.length} games and ${allFiles.length} files.`);

} catch (error) {
    console.error('Error generating sm-files.json:', error);
    if (error.code === 'ENOENT') {
        console.error("Please ensure the 'public/sm' directory exists and contains game folders.");
        // Create an empty file to prevent build failures
        fs.writeFileSync(outputFile, JSON.stringify({ games: [], files: [] }, null, 2));
    }
    // Don't exit with an error if the folder doesn't exist, just log it.
    // process.exit(1); 
}

function parseSscFile(content, relativePath) {
    const songs = [];
    const globalTitle = content.match(/#TITLE:([^;]+);/)?.[1]?.trim() || 'Unknown Title';
    const globalTitleTranslit = content.match(/#TITLETRANSLIT:([^;]+);/)?.[1]?.trim() || '';

    const charts = content.split(/#NOTEDATA:;/g);
    charts.shift(); // Remove content before the first #NOTEDATA:

    for (const chartInfo of charts) {
        const difficultyMatch = chartInfo.match(/#DIFFICULTY:([^;]+);/);
        const stepstypeMatch = chartInfo.match(/#STEPSTYPE:([^;]+);/);
        const meterMatch = chartInfo.match(/#METER:([^;]+);/);

        if (difficultyMatch && stepstypeMatch && meterMatch) {
            const difficulty = difficultyMatch[1].trim();
            const stepstype = stepstypeMatch[1].trim();
            const meter = meterMatch[1].trim();

            // Skip if any of these are empty
            if (!difficulty || !stepstype || !meter) {
                continue;
            }
            
            songs.push({
                path: `${relativePath}?difficulty=${difficulty}`,
                title: `${globalTitle}`,
                titleTranslit: `${globalTitleTranslit}`
            });
        }
    }

    return songs;
}


