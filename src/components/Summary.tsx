import type { GameAnalysis, MoveClass } from '../lib/types.ts';
import { CLASS_INFO, CLASS_ORDER } from '../lib/classify.ts';
import { ClassIcon } from './ClassIcon.tsx';

const HIDDEN_IF_ZERO = new Set<MoveClass>(['forced']);

/** Сводка партии: точность и количество ходов каждого класса. */
export function Summary({ analysis, onStart }: { analysis: GameAnalysis; onStart: () => void }) {
  const { white, black, accuracy, counts } = analysis;
  const rows = CLASS_ORDER.filter((c) => !HIDDEN_IF_ZERO.has(c) || counts.w[c] + counts.b[c] > 0);
  return (
    <div className="summary">
      <div className="summary-players">
        <div className="summary-player">
          <div className="player-avatar white">♔</div>
          <div className="player-name">{white.name}</div>
          {white.rating && <div className="player-rating">{white.rating}</div>}
        </div>
        <div className="summary-player">
          <div className="player-avatar black">♚</div>
          <div className="player-name">{black.name}</div>
          {black.rating && <div className="player-rating">{black.rating}</div>}
        </div>
      </div>
      <div className="accuracy-row">
        <span className="accuracy-label">Точность</span>
        <span className="accuracy-box white">{accuracy.w.toFixed(1)}</span>
        <span className="accuracy-box black">{accuracy.b.toFixed(1)}</span>
      </div>
      <table className="class-table">
        <tbody>
          {rows.map((c) => (
            <tr key={c}>
              <td className="ct-count" style={{ color: CLASS_INFO[c].color }}>
                {counts.w[c]}
              </td>
              <td className="ct-label">
                <ClassIcon cls={c} size={20} />
                <span>{CLASS_INFO[c].label}</span>
              </td>
              <td className="ct-count" style={{ color: CLASS_INFO[c].color }}>
                {counts.b[c]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {analysis.opening && <div className="summary-opening">📖 {analysis.opening}</div>}
      <button className="btn btn-primary btn-wide" onClick={onStart}>
        Начать разбор
      </button>
    </div>
  );
}
