/** Оценка позиции всегда с точки зрения белых. */
export interface Score {
  /** Сантипешки. Для мата: ±(10000 − число ходов до мата). */
  cp: number;
  /** Мат в N ходов: > 0 — матуют белые, < 0 — чёрные, 0 — мат уже на доске (победителя смотрите по знаку cp). */
  mate: number | null;
}

export interface EngineLine {
  score: Score;
  /** Главный вариант в UCI-нотации. */
  pv: string[];
}

export type MoveClass =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export type Color = 'w' | 'b';

export interface MoveAnalysis {
  /** Номер полухода, начиная с 1. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  /** Оценка позиции после хода. */
  scoreAfter: Score;
  cls: MoveClass;
  /** Потеря шансов на победу в процентах (0–100). */
  loss: number;
  accuracy: number;
  bestUci: string | null;
  bestSan: string | null;
  /** Лучший вариант из позиции до хода (SAN). */
  bestLine: string[];
  /** Варианты движка из позиции до хода (SAN), для режима «Повторить». */
  candidates: { uci: string; san: string; win: number }[];
  comment: string;
  opening?: string;
}

export interface PlayerInfo {
  name: string;
  rating?: string;
}

export interface GameAnalysis {
  id: string;
  createdAt: number;
  depth: number;
  white: PlayerInfo;
  black: PlayerInfo;
  result: string;
  date?: string;
  event?: string;
  startFen: string;
  startScore: Score;
  opening?: string;
  moves: MoveAnalysis[];
  accuracy: { w: number; b: number };
  counts: { w: Record<MoveClass, number>; b: Record<MoveClass, number> };
}
