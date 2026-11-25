import type { GameAnalysis, MoveAnalysis } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';
import { formatScore } from '../lib/winrate.ts';
import { ClassIcon } from './ClassIcon.tsx';
import type { VariationStep } from './Review.tsx';

const RETRY_CLASSES = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

export interface RetryState {
  status: 'trying' | 'correct' | 'wrong' | 'revealed';
}

/** Облачко «тренера» с оценкой текущего хода. */
export function Coach({
  analysis,
  move,
  retry,
  onRetry,
  onReveal,
  onExitRetry,
  onShowBest,
  variation,
  onVariationStep,
  onExitVariation,
}: {
  analysis: GameAnalysis;
  move: MoveAnalysis | null;
  retry: RetryState | null;
  onRetry: () => void;
  onReveal: () => void;
  onExitRetry: () => void;
  onShowBest: () => void;
  variation: { steps: VariationStep[]; idx: number } | null;
  onVariationStep: (i: number) => void;
  onExitVariation: () => void;
}) {
  if (variation && move) {
    const { steps, idx } = variation;
    return (
      <div className="coach">
        <div className="coach-avatar" aria-hidden>
          ♞
        </div>
        <div className="coach-bubble">
          <div className="coach-head">
            <div className="coach-title">
              <ClassIcon cls="best" size={22} />
              <span>
                {move.bestSan} — <span style={{ color: CLASS_INFO.best.color }}>лучший ход</span>
              </span>
            </div>
          </div>
          <div className="var-line">
            {steps.map((st, i) => (
              <button key={i} className={`var-move ${idx === i + 1 ? 'active' : ''}`} onClick={() => onVariationStep(i + 1)}>
                {st.label}
              </button>
            ))}
          </div>
          <div className="coach-actions">
            <button className="btn btn-small" onClick={() => onVariationStep(idx - 1)} disabled={idx === 0}>
              ◀
            </button>
            <button className="btn btn-small" onClick={() => onVariationStep(idx + 1)} disabled={idx >= steps.length}>
              ▶
            </button>
            <button className="btn btn-small" onClick={onExitVariation}>
              ↩ Вернуться к партии
            </button>
          </div>
        </div>
      </div>
    );
  }

  let title: React.ReactNode;
  let text: string;
  let score: string | null = null;

  if (retry && move) {
    const turn = move.color === 'w' ? 'белых' : 'чёрных';
    title = 'Найдите лучший ход';
    text =
      retry.status === 'trying'
        ? `Ход ${turn}. Сделайте ход на доске.`
        : retry.status === 'correct'
          ? `Верно! ${move.bestSan ?? ''} — лучший ход.`
          : retry.status === 'wrong'
            ? 'Не совсем. Попробуйте ещё раз.'
            : `Лучший ход: ${move.bestLine.slice(0, 5).join(' ')}`;
  } else if (!move) {
    title = 'Разбор партии';
    text = analysis.opening
      ? `Дебют: ${analysis.opening}. Листайте ходы стрелками ← →.`
      : 'Листайте ходы стрелками ← →.';
  } else {
    const info = CLASS_INFO[move.cls];
    title = (
      <>
        <ClassIcon cls={move.cls} size={22} />
        <span>
          {move.san} — <span style={{ color: info.color }}>{info.label.toLowerCase()}</span>
        </span>
      </>
    );
    text = move.comment;
    score = formatScore(move.scoreAfter);
  }

  const canRetry = !retry && move && RETRY_CLASSES.has(move.cls) && move.bestUci;
  const canShowBest = !retry && move && move.bestSan && move.bestUci !== move.uci && move.cls !== 'best' && move.cls !== 'book' && move.cls !== 'forced';

  return (
    <div className="coach">
      <div className="coach-avatar" aria-hidden>
        ♞
      </div>
      <div className="coach-bubble">
        <div className="coach-head">
          <div className="coach-title">{title}</div>
          {score && <div className="coach-score">{score}</div>}
        </div>
        <div className="coach-text">{text}</div>
        <div className="coach-actions">
          {canShowBest && (
            <button className="btn btn-small btn-best" onClick={onShowBest}>
              ★ Лучший: {move.bestSan}
            </button>
          )}
          {canRetry && (
            <button className="btn btn-small btn-retry" onClick={onRetry}>
              ↻ Повторить
            </button>
          )}
          {retry && retry.status !== 'correct' && retry.status !== 'revealed' && (
            <button className="btn btn-small" onClick={onReveal}>
              Показать ответ
            </button>
          )}
          {retry && (
            <button className="btn btn-small" onClick={onExitRetry}>
              Готово
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
