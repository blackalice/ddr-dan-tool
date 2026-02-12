import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSongIdMap, ensureSongId, saveSongIdMap } from './songIdUtils.mjs';
import {
    collectStats,
    collectTreeStats,
    mergeStats,
    shouldSkipBuild,
    writeCache,
} from './cache-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.join(__dirname, '..');
const SIMFILES_DIR = path.join(ROOT_DIR, 'data', 'simfiles');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'generated');
const IGNORE_DIRS = new Set(['logos']);
const outputFile = path.join(OUTPUT_DIR, 'sm-files.json');
const CACHE_PATH = path.join(OUTPUT_DIR, '.cache', 'sm-files.json');
const SONG_ID_MAP_PATH = path.join(ROOT_DIR, 'data', 'song-ids.json');
const FORCE = process.argv.includes('--force') || process.env.FORCE_DATA === '1' || process.env.DDR_FORCE_DATA === '1';

const isSmOrJacket = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.sm' || ext === '.ssc') return true;
    return /-jacket\.(png|jpg|jpeg|webp)$/i.test(filePath);
};

const JACKET_EXTENSION_PRIORITY = {
    '.webp': 0,
    '.png': 1,
    '.jpg': 2,
    '.jpeg': 3,
};

function pickPreferredJacket(files) {
    return files
        .filter((f) => /-jacket\.(png|jpg|jpeg|webp)$/i.test(f))
        .sort((a, b) => {
            const extA = path.extname(a).toLowerCase();
            const extB = path.extname(b).toLowerCase();
            const priA = JACKET_EXTENSION_PRIORITY[extA] ?? 99;
            const priB = JACKET_EXTENSION_PRIORITY[extB] ?? 99;
            if (priA !== priB) return priA - priB;
            return a.localeCompare(b);
        })[0] || null;
}

function toPublicSmPath(relativePath) {
    const normalized = relativePath.replace(/\\/g, '/');
    return `sm/${normalized}`;
}

function findSongFiles(dir, baseDir) {
    let files = [];
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (IGNORE_DIRS.has(item)) continue;
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
                const jacketFile = pickPreferredJacket(dirItems);
                if (jacketFile) {
                    jacket = path.relative(baseDir, path.join(songDir, jacketFile)).replace(/\\/g, '/');
                }
            } catch {
                // ignore
            }
            files.push({
                path: toPublicSmPath(relativePath),
                title: title.trim(),
                titleTranslit: titleTranslit.trim(),
                jacket: jacket ? toPublicSmPath(jacket) : null,
            });
        }
    }
    return files;
}

async function main() {
    try {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        const inputStats = mergeStats(
            await collectTreeStats(SIMFILES_DIR, (p) => isSmOrJacket(p), ROOT_DIR),
            await collectStats([SONG_ID_MAP_PATH], ROOT_DIR),
        );
        const { skip, reason } = await shouldSkipBuild({
            cachePath: CACHE_PATH,
            inputStats,
            outputPaths: [outputFile],
            force: FORCE,
        });
        if (skip) {
            console.log(`[generate-sm-list] up-to-date (${reason}) — skipping.`);
            return;
        }
        const allFiles = findSongFiles(SIMFILES_DIR, SIMFILES_DIR);

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

        const allGameFolders = fs.readdirSync(SIMFILES_DIR).filter(item =>
            !IGNORE_DIRS.has(item) && fs.statSync(path.join(SIMFILES_DIR, item)).isDirectory()
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
        await writeCache(CACHE_PATH, inputStats);

    } catch (error) {
        console.error('Error generating sm-files.json:', error);
        if (error.code === 'ENOENT') {
            console.error("Please ensure the 'data/simfiles' directory exists and contains game folders.");
            fs.writeFileSync(outputFile, JSON.stringify({ games: [], files: [] }, null, 2));
        }
    }
}

main();
