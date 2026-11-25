import type { Color, GameAnalysis, MoveClass } from './types.ts';

/** Компактная запись о партии для статистики (полный разбор хранится отдельно и может вытесняться). */
export interface GameStat {
  id: string;
  date: number;
  white: string;
  black: string;
  result: string;
  opening?: string;
  accuracy: { w: number; b: number };
  counts: { w: Record<MoveClass, number>; b: Record<MoveClass, number> };
  moves: number;
}

const KEY = 'stats:games';
const MAX = 1000;

export function listStats(): GameStat[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as GameStat[];
  } catch {
    return [];
  }
}

function parseDate(d?: string): number | null {
  if (!d || d.includes('?')) return null;
  const t = Date.parse(d.replace(/\./g, '-'));
  return Number.isNaN(t) ? null : t;
}

export function recordStats(a: GameAnalysis) {
  const rec: GameStat = {
    id: a.id,
    date: parseDate(a.date) ?? a.createdAt,
    white: a.white.name,
    black: a.black.name,
    result: a.result,
    opening: a.opening,
    accuracy: a.accuracy,
    counts: a.counts,
    moves: a.moves.length,
  };
  const list = [rec, ...listStats().filter((s) => s.id !== a.id)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* переполнено */
  }
}

export function clearStats() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface MyGame {
  stat: GameStat;
  color: Color;
  outcome: 'win' | 'loss' | 'draw' | 'unknown';
  accuracy: number;
  counts: Record<MoveClass, number>;
}

export function myGames(names: string[]): MyGame[] {
  const set = new Set(names.map((n) => n.toLowerCase()));
  const out: MyGame[] = [];
  for (const s of listStats()) {
    const color: Color | null = set.has(s.white.toLowerCase()) ? 'w' : set.has(s.black.toLowerCase()) ? 'b' : null;
    if (!color) continue;
    const outcome =
      s.result === '1/2-1/2'
        ? 'draw'
        : s.result === '1-0'
          ? color === 'w'
            ? 'win'
            : 'loss'
          : s.result === '0-1'
            ? color === 'b'
              ? 'win'
              : 'loss'
            : 'unknown';
    out.push({ stat: s, color, outcome, accuracy: s.accuracy[color], counts: s.counts[color] });
  }
  return out.sort((a, b) => a.stat.date - b.stat.date);
}

/** «C41 Philidor Defense: Exchange» → «Philidor Defense». */
export function openingFamily(name?: string): string {
  if (!name) return 'Неизвестный дебют';
  return name.replace(/^[A-E]\d\d\s+/, '').split(':')[0].trim();
}
