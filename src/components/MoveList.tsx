import { useEffect, useRef } from 'react';
import type { MoveAnalysis } from '../lib/types.ts';
import { CLASS_INFO } from '../lib/classify.ts';
import { ClassIcon } from './ClassIcon.tsx';

const SHOW_ICON = new Set(['brilliant', 'great', 'best', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder']);

function MoveCell({ m, active, onSelect }: { m?: MoveAnalysis; active: boolean; onSelect: (ply: number) => void }) {
  if (!m) return <span className="move-cell empty" />;
  const colored = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(m.cls);
  return (
    <button
      className={`move-cell ${active ? 'active' : ''}`}
      onClick={() => onSelect(m.ply)}
      style={colored ? { color: CLASS_INFO[m.cls].color } : undefined}
      title={CLASS_INFO[m.cls].label}
    >
      <span className="move-icon">{SHOW_ICON.has(m.cls) && <ClassIcon cls={m.cls} size={16} />}</span>
      {m.san}
    </button>
  );
}

export function MoveList({
  moves,
  ply,
  result,
  onSelect,
}: {
  moves: MoveAnalysis[];
  ply: number;
  result: string;
  onSelect: (ply: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rows: { num: number; w?: MoveAnalysis; b?: MoveAnalysis }[] = [];
  for (const m of moves) {
    if (m.color === 'w' || !rows.length) rows.push({ num: m.moveNumber });
    rows[rows.length - 1][m.color] = m;
  }

  useEffect(() => {
    const el = ref.current?.querySelector('.move-cell.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  return (
    <div className="move-list" ref={ref}>
      {rows.map((r) => (
        <div className="move-row" key={r.num}>
          <span className="move-num">{r.num}.</span>
          <MoveCell m={r.w} active={r.w?.ply === ply} onSelect={onSelect} />
          <MoveCell m={r.b} active={r.b?.ply === ply} onSelect={onSelect} />
        </div>
      ))}
      <div className="move-result">{result}</div>
    </div>
  );
}
