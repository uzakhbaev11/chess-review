import type { GameAnalysis, MoveAnalysis } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';
import { formatScore } from '../lib/winrate.ts';
import { ClassIcon } from './ClassIcon.tsx';

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
  showBest,
}: {
  analysis: GameAnalysis;
  move: MoveAnalysis | null;
  retry: RetryState | null;
  onRetry: () => void;
  onReveal: () => void;
  onExitRetry: () => void;
  onShowBest: () => void;
  showBest: boolean;
}) {
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
            <button className="btn btn-small" onClick={onShowBest}>
              {showBest ? 'Скрыть лучший' : `Лучший: ${move.bestSan}`}
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
        {!retry && move && showBest && move.bestLine.length > 0 && (
          <div className="coach-line">
            Линия: <span>{move.bestLine.join(' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
