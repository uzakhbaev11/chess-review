import { Chess, type Move } from 'chess.js';
import type { Color, MoveClass, Score } from './types.ts';
import { formatScore } from './winrate.ts';

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * Жертва: после хода соперник может легально забрать фигуру (не пешку)
 * и остаться в плюсе по материалу хотя бы на 2 пешки с учётом размена.
 */
export function isSacrifice(fenAfter: string, move: Move): boolean {
  const chess = new Chess(fenAfter);
  const gained = move.captured ? VALUE[move.captured] : 0;
  const captures = chess.moves({ verbose: true }).filter((m) => m.captured && VALUE[m.captured] >= 3);
  for (const m of captures) {
    const lost = VALUE[m.captured!];
    const probe = new Chess(fenAfter);
    probe.move(m);
    const canRecapture = probe.moves({ verbose: true }).some((r) => r.to === m.to);
    const net = lost - (canRecapture ? VALUE[m.piece] : 0) - gained;
    if (net >= 2) return true;
  }
  return false;
}

export interface ClassifyInput {
  color: Color;
  move: Move;
  legalMoves: number;
  isBook: boolean;
  isBest: boolean;
  /** Шансы игрока до хода (по лучшему ходу), 0–100. */
  winBefore: number;
  /** Шансы игрока после сделанного хода. */
  winAfter: number;
  /** Шансы игрока при втором по силе ходе (если есть). */
  winSecond: number | null;
  /** Потеря соперника на предыдущем ходу. */
  prevOpponentLoss: number;
  prevMove: Move | null;
  isCheckmate: boolean;
}

export function classify(i: ClassifyInput): MoveClass {
  const loss = Math.max(0, i.winBefore - i.winAfter);
  if (i.isBook) return 'book';
  if (i.legalMoves === 1) return 'forced';
  if (i.isCheckmate) return 'best';

  const nearBest = i.isBest || loss < 2;
  if (nearBest && i.winAfter >= 45 && isSacrifice(i.move.after, i.move)) {
    return 'brilliant';
  }

  const trivialRecapture =
    !!i.prevMove?.captured && !!i.move.captured && i.prevMove.to === i.move.to;
  if (
    i.isBest &&
    i.winSecond !== null &&
    i.winBefore - i.winSecond >= 15 &&
    i.winBefore < 97 &&
    !trivialRecapture
  ) {
    return 'great';
  }

  if (i.isBest) return 'best';
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  // Промах: соперник ошибся, а игрок не воспользовался, но и не испортил позицию окончательно
  if (i.prevOpponentLoss >= 10 && loss >= 8 && i.winAfter >= 40) return 'miss';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

export const CLASS_INFO: Record<MoveClass, { label: string; color: string; symbol: string }> = {
  brilliant: { label: 'Блестящий', color: '#26c2a3', symbol: '!!' },
  great: { label: 'Отличный', color: '#749bbf', symbol: '!' },
  best: { label: 'Лучший', color: '#81b64c', symbol: '★' },
  excellent: { label: 'Превосходный', color: '#81b64c', symbol: '✓' },
  good: { label: 'Хороший', color: '#95b776', symbol: '✓' },
  book: { label: 'Теория', color: '#d5a47d', symbol: 'Т' },
  forced: { label: 'Вынужденный', color: '#97af8b', symbol: '→' },
  inaccuracy: { label: 'Неточность', color: '#f7c631', symbol: '?!' },
  mistake: { label: 'Ошибка', color: '#ffa459', symbol: '?' },
  miss: { label: 'Промах', color: '#ff7769', symbol: '✗' },
  blunder: { label: 'Зевок', color: '#fa412d', symbol: '??' },
};

export const CLASS_ORDER: MoveClass[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

function mateFor(s: Score, color: Color): number | null {
  if (s.mate === null || s.mate === 0) return null;
  const forWhite = s.mate > 0;
  const n = Math.abs(s.mate);
  return (color === 'w') === forWhite ? n : -n;
}

export interface CommentInput {
  cls: MoveClass;
  san: string;
  color: Color;
  bestSan: string | null;
  scoreBefore: Score;
  scoreAfter: Score;
  winAfter: number;
  opening?: string;
  isCheckmate: boolean;
}

/** Комментарий «тренера» к ходу. */
export function makeComment(c: CommentInput): string {
  const better = c.bestSan ? ` Лучше было ${c.bestSan}.` : '';
  const mateAfter = mateFor(c.scoreAfter, c.color);
  const mateBefore = mateFor(c.scoreBefore, c.color);
  const evalShift = ` Оценка: ${formatScore(c.scoreBefore)} → ${formatScore(c.scoreAfter)}.`;

  if (c.isCheckmate) return 'Мат — всегда сильнейший ход!';
  switch (c.cls) {
    case 'book':
      return c.opening ? `Теоретический ход. ${c.opening}.` : 'Теоретический ход.';
    case 'forced':
      return 'Единственный возможный ход.';
    case 'brilliant':
      return mateAfter && mateAfter > 0
        ? `Блестяще! Жертва, ведущая к мату в ${mateAfter}.`
        : 'Блестяще! Смелая жертва материала, которая полностью оправдана.';
    case 'great':
      return c.winAfter >= 50
        ? 'Отличный ход! Единственный способ сохранить преимущество.'
        : 'Отличный ход! Единственный способ удержать позицию.';
    case 'best':
      if (mateAfter && mateAfter > 0) return `Лучший ход. Мат в ${mateAfter}.`;
      return 'Это лучший ход в позиции.';
    case 'excellent':
      return 'Превосходный ход, почти не уступает лучшему.';
    case 'good':
      return `Неплохой ход.${better}`;
    case 'inaccuracy':
      return `Неточность.${better}${evalShift}`;
    case 'mistake':
      if (mateBefore && mateBefore > 0 && !(mateAfter && mateAfter > 0))
        return `Ошибка — упущен мат в ${mateBefore}.${better}`;
      return `Ошибка.${better}${evalShift}`;
    case 'miss':
      return `Промах — соперник ошибся, но вы этим не воспользовались.${better}${evalShift}`;
    case 'blunder':
      if (mateAfter && mateAfter < 0) return `Зевок — теперь у соперника мат в ${-mateAfter}.${better}`;
      if (mateBefore && mateBefore > 0 && !(mateAfter && mateAfter > 0))
        return `Зевок — упущен мат в ${mateBefore}.${better}`;
      return `Зевок.${better}${evalShift}`;
  }
}
