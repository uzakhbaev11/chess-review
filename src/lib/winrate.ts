import type { Color, Score } from './types.ts';

/** Вероятность победы белых (0–100) по оценке в сантипешках. Формула lichess. */
export function winFromCp(cp: number): number {
  const c = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** Вероятность победы белых (0–100). */
export function whiteWin(s: Score): number {
  if (s.mate !== null) return s.cp > 0 ? 100 : 0;
  return winFromCp(s.cp);
}

export function winFor(s: Score, color: Color): number {
  const w = whiteWin(s);
  return color === 'w' ? w : 100 - w;
}

/** Точность хода по потере шансов (формула lichess). */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1));
}

function stdDev(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

/**
 * Точность за партию (как на lichess): среднее взвешенного по «остроте»
 * позиции среднего и гармонического среднего точностей ходов.
 * @param wins вероятности победы белых для всех позиций, начиная со стартовой
 * @param firstColor кто ходил первым
 */
export function gameAccuracy(wins: number[], firstColor: Color): { w: number; b: number } {
  const n = wins.length - 1;
  if (n < 1) return { w: 100, b: 100 };
  const windowSize = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const windows: number[][] = [];
  const firstWindow = wins.slice(0, windowSize);
  for (let i = 0; i < Math.min(windowSize - 2, n); i++) windows.push(firstWindow);
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize));
  while (windows.length < n) windows.push(wins.slice(-windowSize));
  const weights = windows.map((w) => Math.max(0.5, Math.min(12, stdDev(w))));

  const acc: Record<Color, { a: number[]; w: number[] }> = { w: { a: [], w: [] }, b: { a: [], w: [] } };
  for (let i = 0; i < n; i++) {
    const color: Color = (i % 2 === 0) === (firstColor === 'w') ? 'w' : 'b';
    const before = color === 'w' ? wins[i] : 100 - wins[i];
    const after = color === 'w' ? wins[i + 1] : 100 - wins[i + 1];
    acc[color].a.push(moveAccuracy(before, after));
    acc[color].w.push(weights[i]);
  }
  const final = (c: Color) => {
    const { a, w } = acc[c];
    if (!a.length) return 100;
    const weighted = a.reduce((s, x, i) => s + x * w[i], 0) / w.reduce((s, x) => s + x, 0);
    const harmonic = a.length / a.reduce((s, x) => s + 1 / Math.max(x, 1), 0);
    return (weighted + harmonic) / 2;
  };
  return { w: final('w'), b: final('b') };
}

/** Текст оценки: «+1.25», «−0.40», «M3», «−M2», «1-0». */
export function formatScore(s: Score): string {
  if (s.mate !== null) {
    if (s.mate === 0) return s.cp > 0 ? '1-0' : '0-1';
    return (s.mate > 0 ? 'M' : '−M') + Math.abs(s.mate);
  }
  const v = s.cp / 100;
  if (Math.abs(v) < 0.005) return '0.00';
  return (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2);
}
