// Прогон анализа в Node: node scripts/test-analyze.ts [depth]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/lib/engine.ts';
import { analyzeGame } from '../src/lib/analyze.ts';
import { CLASS_INFO } from '../src/lib/classify.ts';

const require = createRequire(import.meta.url);
const openings: Record<string, string> = JSON.parse(readFileSync('src/data/openings.json', 'utf8'));
const sf = require('stockfish')('lite-single');
const engine = new Engine({
  send: (c) => sf.processCommand(c),
  onLine: (cb) => { sf.listener = cb; },
  terminate: () => sf.terminate(),
});
const pgn = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : `[White "Morphy"]
[Black "Duke & Count"]
[Result "1-0"]
1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0`;
const t = Date.now();
const res = await analyzeGame(pgn, engine, {
  depth: Number(process.argv[2] ?? 14),
  lookupOpening: (fen) => openings[fen.split(' ').slice(0, 4).join(' ')],
});
for (const m of res.moves) {
  console.log(`${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san.padEnd(7)} ${CLASS_INFO[m.cls].label.padEnd(13)} loss=${m.loss.toFixed(1).padStart(5)} best=${m.bestSan ?? '-'}  | ${m.comment}`);
}
console.log('opening:', res.opening, 'accuracy:', res.accuracy, 'time', (Date.now() - t) / 1000, 's');
engine.terminate();
process.exit(0);
