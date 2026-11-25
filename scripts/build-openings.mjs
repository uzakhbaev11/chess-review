// Собирает src/data/openings.json из TSV-файлов lichess-org/chess-openings.
// Использование: node scripts/build-openings.mjs <папка с a.tsv..e.tsv>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chess.js';

const dir = process.argv[2];
if (!dir) throw new Error('Укажите папку с TSV');
const out = {};
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = readFileSync(join(dir, `${f}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.\s*/g, '').trim().split(/\s+/);
    try { for (const s of sans) chess.move(s); } catch { continue; }
    const key = chess.fen().split(' ').slice(0, 4).join(' ');
    // Более длинные (специфичные) линии перезаписывают, если позиция совпала
    out[key] = `${eco} ${name}`;
  }
}
writeFileSync('src/data/openings.json', JSON.stringify(out));
console.log('positions:', Object.keys(out).length);
