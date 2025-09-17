import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSongIdMap, ensureSongId, saveSongIdMap } from './songIdUtils.mjs';

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
            const title = content.match(/#TITLE:([^;]+);/)?.[1] || 'Unknown Title';
            const titleTranslit = content.match(/#TITLETRANSLIT:([^;]+);/)?.[1] || '';
            const songDir = path.dirname(fullPath);
            let jacket = null;
            try {
                const dirItems = fs.readdirSync(songDir);
                const jacketFile = dirItems.find((f) => /-jacket\.(png|jpg|jpeg|webp)$/i.test(f));
                if (jacketFile) {
                    jacket = path.relative(baseDir, path.join(songDir, jacketFile)).replace(/\\/g, '/');
                }
            } catch {
                // ignore
            }
            files.push({
                path: relativePath,
                title: title.trim(),
                titleTranslit: titleTranslit.trim(),
                jacket: jacket || null,
            });
        }
    }
    return files;
}

async function main() {
    try {
        const publicDir = path.join(__dirname, '..', 'public');
        const allFiles = findSongFiles(smDir, publicDir);

        const songIdMap = await loadSongIdMap();
        let mapChanged = false;
        const filesWithIds = allFiles.map(file => {
            const { id, created } = ensureSongId(songIdMap, file.path);
            if (created) mapChanged = true;
            return { ...file, id };
        });
        if (mapChanged) {
            await saveSongIdMap(songIdMap);
        }

        const allGameFolders = fs.readdirSync(smDir).filter(item =>
            fs.statSync(path.join(smDir, item)).isDirectory()
        );

        const manualSortOrder = [
            'World',
            'A3',
            'A20 Plus',
            'A20',
            'A',
            '2014',
            '2013',
            'X3 vs 2nd',
            'X2',
            'X',
            'SN2',
            'SN1',
            'EX',
            '7th',
            '6th',
            '5th',
            '4th Plus',
            '4th',
            '3rd',
            '2nd',
            'DDR',
            'ITG 1'
        ];

        const gameFolders = allGameFolders.sort((a, b) => {
            const indexA = manualSortOrder.indexOf(a);
            const indexB = manualSortOrder.indexOf(b);

            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB;
            }
            if (indexA !== -1) {
                return -1;
            }
            if (indexB !== -1) {
                return 1;
            }
            return a.localeCompare(b);
        });

        const output = {
            games: gameFolders,
            files: filesWithIds
        };

        fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
        console.log(`Successfully generated sm-files.json with ${gameFolders.length} games and ${filesWithIds.length} files.`);

    } catch (error) {
        console.error('Error generating sm-files.json:', error);
        if (error.code === 'ENOENT') {
            console.error("Please ensure the 'public/sm' directory exists and contains game folders.");
            fs.writeFileSync(outputFile, JSON.stringify({ games: [], files: [] }, null, 2));
        }
    }
}

main();
