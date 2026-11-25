import { Chess, type Move } from 'chess.js';
import type { Engine, RawLine } from './engine.ts';
import type { Color, EngineLine, GameAnalysis, MoveAnalysis, MoveClass, Score } from './types.ts';
import { classify, makeComment, CLASS_ORDER } from './classify.ts';
import { gameAccuracy, moveAccuracy, whiteWin, winFor } from './winrate.ts';

export type OpeningLookup = (fen: string) => string | undefined;

export interface AnalyzeOptions {
  depth: number;
  lookupOpening: OpeningLookup;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Разбирает PGN; бросает ошибку с понятным текстом, если PGN некорректен. */
export function parsePgn(pgn: string): { chess: Chess; moves: Move[] } {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn.trim());
  } catch (e) {
    throw new Error('Не удалось прочитать PGN: ' + (e instanceof Error ? e.message : String(e)));
  }
  const moves = chess.history({ verbose: true });
  if (!moves.length) throw new Error('В партии нет ходов');
  return { chess, moves };
}

function toWhiteScore(line: RawLine, sideToMove: Color): Score {
  const sign = sideToMove === 'w' ? 1 : -1;
  if (line.mate !== null) {
    const m = line.mate * sign;
    return { mate: m, cp: (m > 0 ? 1 : -1) * (10000 - Math.abs(m)) };
  }
  return { cp: (line.cp ?? 0) * sign, mate: null };
}

/** Позиции, где движок не нужен (мат, пат, ничья). */
function terminalScore(fen: string): Score | null {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { mate: 0, cp: c.turn() === 'w' ? -10000 : 10000 };
  if (c.isStalemate() || c.isInsufficientMaterial()) return { cp: 0, mate: null };
  return null;
}

function uciOf(m: { from: string; to: string; promotion?: string }) {
  return m.from + m.to + (m.promotion ?? '');
}

function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

function emptyCounts(): Record<MoveClass, number> {
  return Object.fromEntries(CLASS_ORDER.map((c) => [c, 0])) as Record<MoveClass, number>;
}

export function hashString(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export async function analyzeGame(pgn: string, engine: Engine, opts: AnalyzeOptions): Promise<GameAnalysis> {
  const { chess, moves } = parsePgn(pgn);
  const headers = chess.getHeaders();
  const fens = [moves[0].before, ...moves.map((m) => m.after)];
  const total = fens.length;

  // 1. Оценки всех позиций
  const lines: EngineLine[][] = [];
  const scores: Score[] = [];
  for (let i = 0; i < fens.length; i++) {
    if (opts.signal?.aborted) throw new DOMException('Анализ отменён', 'AbortError');
    const fen = fens[i];
    const term = terminalScore(fen);
    if (term) {
      lines.push([]);
      scores.push(term);
    } else {
      const side = fen.split(' ')[1] as Color;
      const raw = await engine.analyse(fen, opts.depth, 2);
      const ls = raw.map((r) => ({ score: toWhiteScore(r, side), pv: r.pv }));
      lines.push(ls);
      scores.push(ls[0]?.score ?? { cp: 0, mate: null });
    }
    opts.onProgress?.(i + 1, total);
  }

  // 1б. Сглаживаем расхождения глубины: если сделанный ход совпал с вариантом движка,
  // а в позиции после хода движок оценил хуже (например, «потерял» мат), берём оценку варианта.
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const color = m.color as Color;
    const cand = lines[i].find((l) => l.pv[0] === uciOf(m));
    if (!cand || scores[i + 1].mate === 0) continue;
    if (winFor(cand.score, color) <= winFor(scores[i + 1], color)) continue;
    let s = cand.score;
    if (s.mate !== null) {
      const moverMates = (s.mate > 0) === (color === 'w');
      const n = moverMates ? Math.abs(s.mate) - 1 : Math.abs(s.mate);
      const mate = (s.mate > 0 ? 1 : -1) * Math.max(n, 1);
      s = { mate, cp: (mate > 0 ? 1 : -1) * (10000 - Math.abs(mate)) };
    }
    scores[i + 1] = s;
  }

  // 2. Классификация ходов
  const result: MoveAnalysis[] = [];
  let stillBook = true;
  let opening: string | undefined;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const color = m.color as Color;
    const before = lines[i];
    const scoreBefore = scores[i];
    const scoreAfter = scores[i + 1];
    const winBefore = winFor(scoreBefore, color);
    const winAfter = winFor(scoreAfter, color);
    const uci = uciOf(m);
    const bestUci = before[0]?.pv[0] ?? null;
    const isCheckmate = scoreAfter.mate === 0;

    const openingName = opts.lookupOpening(m.after);
    if (stillBook && openingName) opening = openingName;
    else stillBook = false;

    const legal = new Chess(m.before).moves().length;
    const prev = result[i - 1];
    const candidates = before.map((l) => ({
      uci: l.pv[0],
      san: pvToSan(m.before, l.pv, 1)[0] ?? l.pv[0],
      win: winFor(l.score, color),
    }));

    const cls = classify({
      color,
      move: m,
      legalMoves: legal,
      isBook: stillBook && !!openingName,
      isBest: uci === bestUci,
      winBefore,
      winAfter,
      winSecond: before[1] ? winFor(before[1].score, color) : null,
      prevOpponentLoss: prev ? prev.loss : 0,
      prevMove: i > 0 ? moves[i - 1] : null,
      isCheckmate,
    });
    const bestSan = bestUci ? (pvToSan(m.before, [bestUci], 1)[0] ?? null) : null;
    const showBetter = cls !== 'best' && cls !== 'book' && cls !== 'forced' && cls !== 'brilliant' && cls !== 'great';

    result.push({
      ply: i + 1,
      moveNumber: Number(m.before.split(' ')[5]),
      color,
      san: m.san,
      uci,
      from: m.from,
      to: m.to,
      fenBefore: m.before,
      fenAfter: m.after,
      scoreAfter,
      cls,
      loss: Math.max(0, winBefore - winAfter),
      accuracy: moveAccuracy(winBefore, winAfter),
      bestUci,
      bestSan,
      bestLine: before[0] ? pvToSan(m.before, before[0].pv) : [],
      candidates,
      comment: makeComment({
        cls,
        san: m.san,
        color,
        bestSan: showBetter ? bestSan : null,
        scoreBefore,
        scoreAfter,
        winAfter,
        opening: openingName,
        isCheckmate,
      }),
      opening: openingName,
    });
  }

  const firstColor = moves[0].color as Color;
  const counts = { w: emptyCounts(), b: emptyCounts() };
  for (const r of result) counts[r.color][r.cls]++;

  return {
    id: hashString(pgn.trim() + '|' + opts.depth),
    createdAt: Date.now(),
    depth: opts.depth,
    white: { name: headers.White || 'Белые', rating: headers.WhiteElo },
    black: { name: headers.Black || 'Чёрные', rating: headers.BlackElo },
    result: headers.Result || '*',
    date: headers.Date,
    event: headers.Event,
    startFen: fens[0],
    startScore: scores[0],
    opening,
    moves: result,
    accuracy: gameAccuracy(scores.map(whiteWin), firstColor),
    counts,
  };
}
