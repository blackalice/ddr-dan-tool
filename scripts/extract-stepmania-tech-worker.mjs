import { promises as fs } from 'fs';
import { parentPort } from 'worker_threads';
import { parseSm } from '../src/utils/smParser.js';
import { computeChartMetrics } from '../src/utils/chartMetrics.js';
import { computeItgmaniaTechCounts } from './itgmania-tech-counts.mjs';
import { buildCounts } from './stepmania-tech-counts-utils.mjs';

async function processJob(job) {
  const source = await fs.readFile(job.fullPath, 'utf8');
  const parsed = parseSm(source);
  const availableTypes = Array.isArray(parsed?.availableTypes) ? parsed.availableTypes : [];
  const charts = parsed?.charts && typeof parsed.charts === 'object' ? parsed.charts : {};
  const chartEntries = [];

  for (const chartType of availableTypes) {
    const mode = String(chartType?.mode || '').toLowerCase();
    const difficulty = String(chartType?.difficulty || '').toLowerCase();
    const slug = chartType?.slug;
    if (!slug || !mode || !difficulty) continue;
    const chart = charts[slug];
    if (!chart || typeof chart !== 'object') continue;

    const metrics = computeChartMetrics(chart);
    const itgTech = computeItgmaniaTechCounts(chart);
    const counts = buildCounts(metrics, itgTech);
    if (counts) chartEntries.push({ mode, difficulty, counts });
  }

  return {
    type: 'result',
    index: job.index,
    songPath: job.songPath,
    songId: job.songId,
    chartEntries,
  };
}

parentPort.on('message', (message) => {
  if (message?.type !== 'process') return;
  processJob(message.job)
    .then((result) => parentPort.postMessage(result))
    .catch((err) => parentPort.postMessage({
      type: 'result',
      index: message.job?.index,
      songPath: message.job?.songPath,
      error: err?.message || String(err),
    }));
});
