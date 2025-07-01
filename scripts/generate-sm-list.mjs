import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const smDir = path.join(__dirname, '..', 'public', 'sm');
const outputFile = path.join(__dirname, '..', 'public', 'sm-files.json');

function findSmFiles(dir, baseDir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            files = files.concat(findSmFiles(fullPath, baseDir));
        } else if (path.extname(fullPath) === '.sm') {
            const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
            const content = fs.readFileSync(fullPath, 'utf-8');
            const title = content.match(/#TITLE:([^;]+);/)?.[1] || 'Unknown Title';
            const titleTranslit = content.match(/#TITLETRANSLIT:([^;]+);/)?.[1] || '';
            files.push({
                path: relativePath,
                title: title.trim(),
                titleTranslit: titleTranslit.trim()
            });
        }
    }
    return files;
}

try {
    const publicDir = path.join(__dirname, '..', 'public');
    const allFiles = findSmFiles(smDir, publicDir);
    
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