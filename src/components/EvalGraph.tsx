import type { GameAnalysis, MoveClass } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';
import { whiteWin } from '../lib/winrate.ts';

const DOT_CLASSES = new Set<MoveClass>(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);

/** График преимущества по ходу партии; клик переходит к ходу. */
export function EvalGraph({
  analysis,
  ply,
  onSelect,
}: {
  analysis: GameAnalysis;
  ply: number;
  onSelect: (ply: number) => void;
}) {
  const W = 600;
  const H = 110;
  const values = [whiteWin(analysis.startScore), ...analysis.moves.map((m) => whiteWin(m.scoreAfter))];
  const n = values.length - 1;
  const x = (i: number) => (n === 0 ? 0 : (i / n) * W);
  const y = (v: number) => H - (v / 100) * H;
  const area = `M0,${H} ` + values.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + ` L${W},${H} Z`;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    onSelect(Math.max(0, Math.min(n, Math.round(rel * n))));
  };

  return (
    <svg
      className="eval-graph"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onClick={handleClick}
      role="img"
      aria-label="График оценки"
    >
      <rect width={W} height={H} fill="var(--graph-black)" />
      <path d={area} fill="var(--graph-white)" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--graph-mid)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {ply > 0 && (
        <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      )}
      {analysis.moves.map((m) =>
        DOT_CLASSES.has(m.cls) ? (
          <ellipse
            key={m.ply}
            cx={x(m.ply)}
            cy={y(values[m.ply])}
            rx={W / 120}
            ry={H / 22}
            fill={CLASS_INFO[m.cls].color}
            stroke="rgba(0,0,0,.4)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {m.moveNumber}
              {m.color === 'w' ? '. ' : '… '}
              {m.san} — {CLASS_INFO[m.cls].label}
            </title>
          </ellipse>
        ) : null,
      )}
    </svg>
  );
}
