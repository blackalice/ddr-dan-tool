import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseGanymedeHtml } from '../src/utils/parseGanymedeHtml.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const [input, output = 'ganymede-scores.json', play = 'SP'] = process.argv.slice(2);

if (!input) {
  console.error('Usage: node scripts/parse-ganymede-html.mjs <input.html> [output.json] [SP|DP]');
  process.exit(1);
}

(async () => {
  try {
    const html = await fs.readFile(path.resolve(__dirname, '..', input), 'utf-8');
    const data = parseGanymedeHtml(html, play.toUpperCase());
    await fs.writeFile(path.resolve(__dirname, '..', output), JSON.stringify(data, null, 2));
    console.log(`Successfully created '${output}' with ${data.scores.length} scores.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
