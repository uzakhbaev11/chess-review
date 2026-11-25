import type { OpeningLookup } from './analyze.ts';

let cache: Promise<OpeningLookup> | null = null;

/** Лениво подгружает базу дебютов (lichess chess-openings, ~3.8 тыс. позиций). */
export function loadOpenings(): Promise<OpeningLookup> {
  cache ??= import('../data/openings.json').then((mod) => {
    const db = mod.default as Record<string, string>;
    return (fen: string) => db[fen.split(' ').slice(0, 4).join(' ')];
  });
  return cache;
}
