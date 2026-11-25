// Печатает промпт для хода (отладка): node scripts/print-prompt.ts
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
(globalThis as any).localStorage = { getItem: () => null, setItem() {} };
const { Engine } = await import('../src/lib/engine.ts');
const { analyzeGame } = await import('../src/lib/analyze.ts');
const { movePrompt } = await import('../src/lib/ai.ts');
const openings = JSON.parse(readFileSync('src/data/openings.json', 'utf8'));
const sf = require('stockfish')('lite-single');
const engine = new Engine({ send: (c) => sf.processCommand(c), onLine: (cb) => { sf.listener = cb; }, terminate: () => sf.terminate() });
const a = await analyzeGame('1.e4 e5 2.Nf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Qxf3 dxe5 6.Bc4 Nf6 7.Qb3 Qe7 8.Nc3 c6 9.Bg5 b5 10.Nxb5 cxb5 11.Bxb5+ Nbd7 12.O-O-O Rd8 13.Rxd7 Rxd7 14.Rd1 Qe6 15.Bxd7+ Nxd7 16.Qb8+ Nxb8 17.Rd8# 1-0', engine, { depth: 14, lookupOpening: (f) => openings[f.split(' ').slice(0, 4).join(' ')] });
for (const ply of [12, 18, 31]) console.log('-----\n' + movePrompt(a, a.moves[ply - 1]));
engine.terminate(); process.exit(0);
