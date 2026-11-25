import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import type { Color, GameAnalysis, MoveClass } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';
import { ClassIcon } from './ClassIcon.tsx';
import { EvalBar } from './EvalBar.tsx';
import { EvalGraph } from './EvalGraph.tsx';
import { MoveList } from './MoveList.tsx';
import { Summary } from './Summary.tsx';
import { Coach, type RetryState } from './Coach.tsx';
import { AiChat, AiGameReview, AiMoveExplain } from './Ai.tsx';
import { playSound, soundForSan } from '../lib/sound.ts';
import { AI_FEATURE_ENABLED, BOARD_THEMES, useSettings } from '../lib/settings.ts';

/** Вариант движка, разыгрываемый на доске (кнопка «Лучший»). */
export interface VariationStep {
  san: string;
  from: string;
  to: string;
  fen: string;
  label: string;
}

function buildVariation(fen: string, sans: string[]): VariationStep[] {
  const c = new Chess(fen);
  const steps: VariationStep[] = [];
  for (const san of sans) {
    const before = c.fen().split(' ');
    let mv;
    try {
      mv = c.move(san);
    } catch {
      break;
    }
    const num = before[5];
    steps.push({ san: mv.san, from: mv.from, to: mv.to, fen: c.fen(), label: before[1] === 'w' ? `${num}. ${mv.san}` : `${num}… ${mv.san}` });
  }
  return steps;
}

const KEY_CLASSES = new Set<MoveClass>(['brilliant', 'great', 'mistake', 'miss', 'blunder']);
const AUTO_ARROW = new Set<MoveClass>(['inaccuracy', 'mistake', 'miss', 'blunder', 'good']);

export function Review({
  analysis,
  orientation: initialOrientation,
  me,
  onBack,
  onOpenSettings,
}: {
  analysis: GameAnalysis;
  orientation: Color;
  me?: Color;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const { moves } = analysis;
  const settings = useSettings();
  const theme = BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.green;
  const [ply, setPly] = useState(0);
  const [tab, setTab] = useState<'summary' | 'moves'>('summary');
  const [flipped, setFlipped] = useState(initialOrientation === 'b');
  /** Шаг в разыгрываемом варианте: null — вариант не показан, 0 — позиция до хода, 1..N — после N ходов. */
  const [varIdx, setVarIdx] = useState<number | null>(null);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [retryFen, setRetryFen] = useState<string | null>(null);

  const move = ply > 0 ? moves[ply - 1] : null;
  const variation = useMemo(() => (move ? buildVariation(move.fenBefore, move.bestLine) : []), [move]);
  const inVariation = varIdx !== null && variation.length > 0;

  const stepVariation = (i: number) => {
    const next = Math.max(0, Math.min(variation.length, i));
    if (next === varIdx) return;
    if (next > 0) playSound(soundForSan(variation[next - 1].san));
    else playSound('move');
    setVarIdx(next);
  };
  const keyPlies = useMemo(() => moves.filter((m) => KEY_CLASSES.has(m.cls)).map((m) => m.ply), [moves]);

  const go = useCallback(
    (p: number) => {
      const next = Math.max(0, Math.min(moves.length, p));
      if (next === ply + 1 && next > 0) playSound(soundForSan(moves[next - 1].san));
      else if (next !== ply) playSound('move');
      setPly(next);
      setVarIdx(null);
      setRetry(null);
      setRetryFen(null);
      setTab('moves');
    },
    [moves, ply],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (inVariation && e.key === 'ArrowLeft') stepVariation(varIdx! - 1);
      else if (inVariation && e.key === 'ArrowRight') stepVariation(varIdx! + 1);
      else if (inVariation && e.key === 'Escape') setVarIdx(null);
      else if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(moves.length);
      else if (e.key === 'f' || e.key === 'а') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // --- Доска
  const prevScore = ply > 1 ? moves[ply - 2].scoreAfter : analysis.startScore;
  const varStep = inVariation && varIdx! > 0 ? variation[varIdx! - 1] : null;
  const fen = retry
    ? (retryFen ?? move!.fenBefore)
    : inVariation
      ? (varStep?.fen ?? move!.fenBefore)
      : move
        ? move.fenAfter
        : analysis.startFen;
  // В варианте показываем оценку лучшей игры (оценку позиции до ошибки)
  const score = inVariation ? prevScore : move ? move.scoreAfter : analysis.startScore;

  const arrows = useMemo(() => {
    if (!move || !move.bestUci || retry) {
      if (retry?.status === 'revealed' && move?.bestUci)
        return [{ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: 'rgba(129,182,76,.85)' }];
      return [];
    }
    if (inVariation) {
      // На позиции до хода — стрелка следующего хода варианта
      const nextStep = variation[varIdx!];
      return varIdx === 0 && nextStep
        ? [{ startSquare: nextStep.from, endSquare: nextStep.to, color: 'rgba(129,182,76,.85)' }]
        : [];
    }
    if (move.bestUci === move.uci) return [];
    if (!AUTO_ARROW.has(move.cls)) return [];
    return [{ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: 'rgba(129,182,76,.85)' }];
  }, [move, retry, inVariation, varIdx, variation]);

  const highlight: Record<string, React.CSSProperties> = {};
  if (varStep) {
    const c = varIdx === 1 ? CLASS_INFO.best.color : '#f6f669';
    highlight[varStep.from] = { background: `${c}80` };
    highlight[varStep.to] = { background: `${c}a8` };
  } else if (move && !retry && !inVariation) {
    const c = CLASS_INFO[move.cls].color;
    highlight[move.from] = { background: `${c}80` };
    highlight[move.to] = { background: `${c}a8` };
  }

  const squareRenderer = ({ square, children }: { square: string; children?: React.ReactNode }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative', ...highlight[square] }}>
      {children}
      {move && !retry && !inVariation && square === move.to && (
        <div className="square-badge">
          <ClassIcon cls={move.cls} size={28} />
        </div>
      )}
      {varStep && varIdx === 1 && square === varStep.to && (
        <div className="square-badge">
          <ClassIcon cls="best" size={28} />
        </div>
      )}
    </div>
  );

  const onPieceDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!retry || !move || !targetSquare || retry.status === 'correct' || retry.status === 'revealed') return false;
    const c = new Chess(move.fenBefore);
    let played;
    try {
      played = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }
    const uci = played.from + played.to + (played.promotion ?? '');
    const top = move.candidates[0]?.win ?? 0;
    const ok = move.candidates.some((cand) => cand.uci === uci && cand.win >= top - 2);
    if (ok) {
      setRetryFen(c.fen());
      setRetry({ status: 'correct' });
      playSound('success');
      return true;
    }
    playSound('error');
    setRetry({ status: 'wrong' });
    return false;
  };

  const nextKey = keyPlies.find((p) => p > ply);
  const prevKey = [...keyPlies].reverse().find((p) => p < ply);

  return (
    <div className="review">
      <div className="board-area">
        <PlayerStrip analysis={analysis} color={flipped ? 'w' : 'b'} />
        <div className="board-row">
          <EvalBar score={score} flipped={flipped} />
          <div className="board-wrap">
            <Chessboard
              options={{
                id: 'review-board',
                position: fen,
                boardOrientation: flipped ? 'black' : 'white',
                arrows,
                allowDragging: !!retry,
                allowDrawingArrows: true,
                onPieceDrop,
                squareRenderer,
                animationDurationInMs: 180,
                darkSquareStyle: { backgroundColor: theme.dark },
                lightSquareStyle: { backgroundColor: theme.light },
              }}
            />
          </div>
        </div>
        <PlayerStrip analysis={analysis} color={flipped ? 'b' : 'w'} />
      </div>

      <aside className="panel">
        <div className="panel-head">
          <button className="btn btn-ghost" onClick={onBack} aria-label="Назад">
            ←
          </button>
          <div className="panel-title">Отчёт о партии</div>
          <button className="btn btn-ghost" onClick={() => setFlipped((f) => !f)} title="Перевернуть доску (F)">
            ⇅
          </button>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
            Сводка
          </button>
          <button className={`tab ${tab === 'moves' ? 'active' : ''}`} onClick={() => setTab('moves')}>
            Анализ
          </button>
        </div>

        {tab === 'summary' ? (
          <div className="panel-body">
            <EvalGraph analysis={analysis} ply={ply} onSelect={go} />
            <Summary analysis={analysis} onStart={() => go(ply || 1)} />
            {AI_FEATURE_ENABLED && <AiGameReview analysis={analysis} me={me} onOpenSettings={onOpenSettings} />}
          </div>
        ) : (
          <div className="panel-body analysis">
            <Coach
              analysis={analysis}
              move={move}
              retry={retry}
              variation={inVariation ? { steps: variation, idx: varIdx! } : null}
              onShowBest={() => {
                playSound(soundForSan(variation[0]?.san ?? ''));
                setVarIdx(1);
              }}
              onVariationStep={stepVariation}
              onExitVariation={() => setVarIdx(null)}
              onRetry={() => {
                setVarIdx(null);
                setRetry({ status: 'trying' });
                setRetryFen(null);
              }}
              onReveal={() => setRetry({ status: 'revealed' })}
              onExitRetry={() => {
                setRetry(null);
                setRetryFen(null);
              }}
            />
            {AI_FEATURE_ENABLED && move && !retry && (
              <AiMoveExplain analysis={analysis} move={move} onOpenSettings={onOpenSettings} />
            )}
            <button className="btn btn-primary btn-wide" onClick={() => go(ply + 1)} disabled={ply >= moves.length}>
              → Далее
            </button>
            <MoveList moves={moves} ply={ply} result={analysis.result} onSelect={go} />
            <EvalGraph analysis={analysis} ply={ply} onSelect={go} />
            <div className="key-moments">
              <button className="btn" disabled={prevKey === undefined} onClick={() => prevKey !== undefined && go(prevKey)}>
                ← Ключевой момент
              </button>
              <button className="btn" disabled={nextKey === undefined} onClick={() => nextKey !== undefined && go(nextKey)}>
                Ключевой момент →
              </button>
            </div>
            {AI_FEATURE_ENABLED && <AiChat analysis={analysis} ply={ply} onOpenSettings={onOpenSettings} />}
          </div>
        )}

        <div className="nav-controls">
          <button className="btn" onClick={() => go(0)} aria-label="В начало">
            ⏮
          </button>
          <button className="btn" onClick={() => (inVariation ? stepVariation(varIdx! - 1) : go(ply - 1))} aria-label="Назад">
            ◀
          </button>
          <button className="btn" onClick={() => (inVariation ? stepVariation(varIdx! + 1) : go(ply + 1))} aria-label="Вперёд">
            ▶
          </button>
          <button className="btn" onClick={() => go(moves.length)} aria-label="В конец">
            ⏭
          </button>
        </div>
      </aside>
    </div>
  );
}

function PlayerStrip({ analysis, color }: { analysis: GameAnalysis; color: Color }) {
  const p = color === 'w' ? analysis.white : analysis.black;
  const acc = analysis.accuracy[color];
  return (
    <div className="player-strip">
      <span className={`player-dot ${color === 'w' ? 'white' : 'black'}`} />
      <span className="player-name">{p.name}</span>
      {p.rating && <span className="player-rating">({p.rating})</span>}
      <span className="player-acc" title="Точность">
        {acc.toFixed(1)}%
      </span>
    </div>
  );
}
