import cheerio from 'cheerio';

const lampMapping = {
  'MARVELOUS FC': 'MARVELOUS FULL COMBO',
  'PERFECT FC': 'PERFECT FULL COMBO',
  'GREAT FC': 'GREAT FULL COMBO',
  'GOOD FC': 'FULL COMBO',
  'ASSIST CLEAR': 'ASSIST',
  'LIFE CLEAR': 'CLEAR',
  CLEAR: 'CLEAR',
  FAILED: 'FAILED',
};
const lampKeysSorted = Object.keys(lampMapping).sort((a, b) => b.length - a.length);

const romanNumeralMap = {
  '\u2160': 'I',
  '\u2161': 'II',
  '\u2162': 'III',
  '\u2163': 'IV',
  '\u2164': 'V',
  '\u2165': 'VI',
  '\u2166': 'VII',
  '\u2167': 'VIII',
  '\u2168': 'IX',
};

export function parseGanymedeHtml(html, playtype = 'SP') {
  const $ = cheerio.load(html);
  const tbody = $(`tbody#${playtype.toLowerCase()}-tbody`);
  const scoresData = {
    meta: { game: 'ddr', playtype, service: 'Ganymede' },
    scores: [],
  };
  if (tbody.length === 0) {
    return scoresData;
  }
  const headers = $('thead')
    .find('th')
    .slice(1)
    .map((_, el) => $(el).text().trim())
    .get();
  tbody.find('tr').each((_, row) => {
    const cols = $(row).find('td');
    const titleArtist = cols.first();
    const title = titleArtist.find('strong').text().trim();
    const artist = titleArtist
      .contents()
      .filter((_, n) => n.type === 'text')
      .last()
      .text()
      .trim();
    cols.slice(1).each((i, cell) => {
      const cellText = $(cell).text().trim();
      if (cellText === '-') return;
      const scoreLink = $(cell).find('a');
      if (!scoreLink.length) return;
      const score = parseInt(scoreLink.text().replace(/,/g, ''), 10);
      const cellLines = $(cell)
        .text()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      let rawLampText = 'NO PLAY';
      if (cellLines.length > 2) rawLampText = cellLines[1];
      let lamp = rawLampText;
      let flare;
      for (const key of lampKeysSorted) {
        if (rawLampText.startsWith(key)) {
          lamp = lampMapping[key];
          const flareText = rawLampText.slice(key.length).trim();
          if (flareText) flare = romanNumeralMap[flareText] || flareText;
          break;
        }
      }
      const difficulty = headers[i];
      const entry = {
        score,
        lamp,
        difficulty,
        matchType: 'songTitle',
        identifier: title,
        artist,
      };
      if (flare) entry.optional = { flare };
      scoresData.scores.push(entry);
    });
  });
  return scoresData;
}
