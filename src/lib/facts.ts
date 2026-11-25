import { Chess, type Square } from 'chess.js';

// Факты о ходе, посчитанные программно. Маленькие локальные модели не умеют «видеть» доску,
// поэтому мы даём им готовые факты, а модель только пересказывает их понятным языком.

const NOM: Record<string, string> = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
const ACC: Record<string, string> = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(c: Chess, color: 'w' | 'b'): number {
  let s = 0;
  for (const row of c.board()) for (const sq of row) if (sq) s += (sq.color === color ? 1 : -1) * VALUE[sq.type];
  return s;
}

/** Описание одного хода из позиции fen. Возвращает null, если ход нелегален. */
export function moveFacts(fen: string, san: string): { text: string; facts: string[] } | null {
  const c = new Chess(fen);
  let mv;
  try {
    mv = c.move(san);
  } catch {
    return null;
  }
  const me = mv.color;
  const opp = me === 'w' ? 'b' : 'w';
  const facts: string[] = [];

  if (mv.san.startsWith('O-O-O')) facts.push('длинная рокировка');
  else if (mv.san.startsWith('O-O')) facts.push('короткая рокировка');
  else facts.push(`${NOM[mv.piece]} идёт с ${mv.from} на ${mv.to}`);
  if (mv.captured) facts.push(`забирает ${ACC[mv.captured]}`);
  if (mv.promotion) facts.push(`пешка превращается в ${NOM[mv.promotion]}а`.replace('ферзьа', 'ферзя'));
  if (c.isCheckmate()) facts.push('ставит мат');
  else if (c.inCheck()) facts.push('объявляет шах');

  // На кого нападает походившая фигура
  const targets: string[] = [];
  let bigTargets = 0;
  for (const row of c.board())
    for (const sq of row) {
      if (!sq || sq.color !== opp || sq.type === 'k' || sq.type === 'p') continue;
      if (c.attackers(sq.square as Square, me).includes(mv.to as Square)) {
        const defended = c.isAttacked(sq.square as Square, opp);
        targets.push(`${ACC[sq.type]} на ${sq.square}${defended ? '' : ' (незащищённого)'}`);
        if (VALUE[sq.type] >= 3) bigTargets++;
      }
    }
  if (targets.length) facts.push(`нападает на ${targets.join(' и ')}`);
  if (!c.isCheckmate() && (bigTargets >= 2 || (bigTargets >= 1 && c.inCheck()))) facts.push('это двойной удар (вилка)');

  // Свои фигуры, оставшиеся под боем
  const hanging: string[] = [];
  for (const row of c.board())
    for (const sq of row) {
      if (!sq || sq.color !== me || sq.type === 'k' || sq.type === 'p') continue;
      const attackers = c.attackers(sq.square as Square, opp);
      if (!attackers.length) continue;
      const minAtt = Math.min(...attackers.map((a) => VALUE[c.get(a)!.type] || 100));
      const defended = c.isAttacked(sq.square as Square, me);
      if (!defended || minAtt < VALUE[sq.type]) hanging.push(`${NOM[sq.type]} на ${sq.square}`);
    }
  if (hanging.length) facts.push(`под боем остаётся: ${hanging.join(', ')}`);

  if (mv.captured || mv.promotion) {
    const bal = material(c, 'w');
    facts.push(bal === 0 ? 'материал сравнялся' : `материал: у ${bal > 0 ? 'белых' : 'чёрных'} перевес ${Math.abs(bal)}`);
  }

  return { text: `${mv.san} — ${facts.join('; ')}`, facts };
}

/** Описание варианта: первые ходы с фактами. */
export function lineFacts(fen: string, sans: string[], max = 3): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const san of sans.slice(0, max)) {
    const f = moveFacts(c.fen(), san);
    if (!f) break;
    out.push(f.text);
    c.move(san);
  }
  return out;
}
