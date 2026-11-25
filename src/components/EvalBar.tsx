import type { Score } from '../lib/types.ts';
import { formatScore, whiteWin } from '../lib/winrate.ts';

/** Вертикальная шкала оценки слева от доски. */
export function EvalBar({ score, flipped }: { score: Score; flipped: boolean }) {
  const white = whiteWin(score);
  const pct = score.mate === 0 ? (score.cp > 0 ? 100 : 0) : Math.max(4, Math.min(96, white));
  const whiteAhead = score.cp >= 0;
  const label = formatScore(score).replace('+', '').replace('−', '');
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`} aria-label={`Оценка ${formatScore(score)}`}>
      <div className="eval-bar-white" style={{ height: `${pct}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'bottom' : 'top'}`}>{label}</span>
    </div>
  );
}
