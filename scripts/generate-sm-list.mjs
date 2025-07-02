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
    const gameFolders = fs.readdirSync(smDir).filter(item => 
        fs.statSync(path.join(smDir, item)).isDirectory()
    );

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

    // Add the main song by default
    songs.push({
        path: relativePath,
        title: globalTitle,
        titleTranslit: globalTitleTranslit
    });

    const charts = content.split(/#NOTEDATA:;/g);
    const chartInfos = charts.slice(0, -1); // Last element is after the last NOTEDATA
    chartInfos.shift(); // The part of the file before the first NOTEDATA

    let currentDifficulty = 'Beginner'; // Default difficulty
    for (const chartInfo of chartInfos) {
        const difficultyMatch = chartInfo.match(/#DIFFICULTY:([^;]+);/);
        if (difficultyMatch) {
            currentDifficulty = difficultyMatch[1].trim();
        }

        const bpmsMatch = chartInfo.match(/#BPMS:([^;]+);/);
        if (bpmsMatch) {
            // This chart has its own BPM, so treat it as a separate song
            songs.push({
                path: `${relativePath}?difficulty=${currentDifficulty}`,
                title: `${globalTitle} (${currentDifficulty})`,
                titleTranslit: `${globalTitleTranslit} (${currentDifficulty})`
            });
        }
    }

    return songs;
}


