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

const KEY_CLASSES = new Set<MoveClass>(['brilliant', 'great', 'mistake', 'miss', 'blunder']);
const AUTO_ARROW = new Set<MoveClass>(['inaccuracy', 'mistake', 'miss', 'blunder', 'good']);

export function Review({
  analysis,
  orientation: initialOrientation,
  onBack,
}: {
  analysis: GameAnalysis;
  orientation: Color;
  onBack: () => void;
}) {
  const { moves } = analysis;
  const [ply, setPly] = useState(0);
  const [tab, setTab] = useState<'summary' | 'moves'>('summary');
  const [flipped, setFlipped] = useState(initialOrientation === 'b');
  const [showBest, setShowBest] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);
  const [retryFen, setRetryFen] = useState<string | null>(null);

  const move = ply > 0 ? moves[ply - 1] : null;
  const keyPlies = useMemo(() => moves.filter((m) => KEY_CLASSES.has(m.cls)).map((m) => m.ply), [moves]);

  const go = useCallback(
    (p: number) => {
      setPly(Math.max(0, Math.min(moves.length, p)));
      setShowBest(false);
      setRetry(null);
      setRetryFen(null);
      setTab('moves');
    },
    [moves.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(moves.length);
      else if (e.key === 'f' || e.key === 'а') setFlipped((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, ply, moves.length]);

  // --- Доска
  const fen = retry ? (retryFen ?? move!.fenBefore) : move ? move.fenAfter : analysis.startFen;
  const score = move ? move.scoreAfter : analysis.startScore;

  const arrows = useMemo(() => {
    if (!move || !move.bestUci || retry) {
      if (retry?.status === 'revealed' && move?.bestUci)
        return [{ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: 'rgba(129,182,76,.85)' }];
      return [];
    }
    if (move.bestUci === move.uci) return [];
    if (!showBest && !AUTO_ARROW.has(move.cls)) return [];
    return [{ startSquare: move.bestUci.slice(0, 2), endSquare: move.bestUci.slice(2, 4), color: 'rgba(129,182,76,.85)' }];
  }, [move, showBest, retry]);

  const highlight: Record<string, React.CSSProperties> = {};
  if (move && !retry) {
    const c = CLASS_INFO[move.cls].color;
    highlight[move.from] = { background: `${c}80` };
    highlight[move.to] = { background: `${c}a8` };
  }

  const squareRenderer = ({ square, children }: { square: string; children?: React.ReactNode }) => (
    <div style={{ width: '100%', height: '100%', position: 'relative', ...highlight[square] }}>
      {children}
      {move && !retry && square === move.to && (
        <div className="square-badge">
          <ClassIcon cls={move.cls} size={28} />
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
      return true;
    }
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
                darkSquareStyle: { backgroundColor: 'var(--sq-dark)' },
                lightSquareStyle: { backgroundColor: 'var(--sq-light)' },
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
          </div>
        ) : (
          <div className="panel-body">
            <Coach
              analysis={analysis}
              move={move}
              retry={retry}
              showBest={showBest}
              onShowBest={() => setShowBest((s) => !s)}
              onRetry={() => {
                setRetry({ status: 'trying' });
                setRetryFen(null);
              }}
              onReveal={() => setRetry({ status: 'revealed' })}
              onExitRetry={() => {
                setRetry(null);
                setRetryFen(null);
              }}
            />
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
          </div>
        )}

        <div className="nav-controls">
          <button className="btn" onClick={() => go(0)} aria-label="В начало">
            ⏮
          </button>
          <button className="btn" onClick={() => go(ply - 1)} aria-label="Назад">
            ◀
          </button>
          <button className="btn" onClick={() => go(ply + 1)} aria-label="Вперёд">
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
