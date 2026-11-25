// Копирует Stockfish (lite, однопоточный WASM) в public/engine перед dev/build.
import { mkdirSync, copyFileSync } from 'node:fs';
mkdirSync('public/engine', { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(`node_modules/stockfish/bin/${f}`, `public/engine/${f}`);
}
console.log('Stockfish скопирован в public/engine');
