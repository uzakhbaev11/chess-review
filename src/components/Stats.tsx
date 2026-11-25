import { useMemo, useState } from 'react';
import { clearStats, listStats, myGames, openingFamily, type MyGame } from '../lib/stats.ts';
import { myNameList, updateSettings, useSettings } from '../lib/settings.ts';
import { CLASS_INFO, CLASS_ORDER } from '../lib/classify.ts';
import type { MoveClass } from '../lib/types.ts';
import { ClassIcon } from './ClassIcon.tsx';

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function AccuracyChart({ games }: { games: MyGame[] }) {
  const W = 600;
  const H = 140;
  if (games.length < 2) return null;
  const x = (i: number) => (i / (games.length - 1)) * W;
  const y = (v: number) => H - (v / 100) * H;
  const pts = games.map((g, i) => `${x(i).toFixed(1)},${y(g.accuracy).toFixed(1)}`).join(' ');
  // скользящее среднее по 5 партиям
  const ma = games.map((_, i) => avg(games.slice(Math.max(0, i - 4), i + 1).map((g) => g.accuracy)));
  const maPts = ma.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="acc-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Точность по партиям">
      {[25, 50, 75].map((v) => (
        <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline points={pts} fill="none" stroke="var(--muted)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <polyline points={maPts} fill="none" stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      {games.map((g, i) => (
        <circle
          key={g.stat.id}
          cx={x(i)}
          cy={y(g.accuracy)}
          r="3"
          fill={g.outcome === 'win' ? 'var(--accent)' : g.outcome === 'loss' ? 'var(--danger)' : 'var(--muted)'}
          vectorEffect="non-scaling-stroke"
        >
          <title>
            {g.stat.white} — {g.stat.black}: {g.accuracy.toFixed(1)}%
          </title>
        </circle>
      ))}
    </svg>
  );
}

export function Stats({ onOpenGame }: { onOpenGame: (id: string) => void }) {
  const settings = useSettings();
  const [version, setVersion] = useState(0);
  const names = useMemo(() => myNameList(), [settings.myNames]);
  const games = useMemo(() => myGames(names), [names, version]);
  const total = useMemo(() => listStats().length, [version]);

  if (!names.length) {
    return (
      <div className="stats card">
        <h2>📊 Статистика</h2>
        <p className="hint">Укажите свои ники, чтобы собрать статистику по вашим партиям.</p>
        <NamesInput />
      </div>
    );
  }

  const wins = games.filter((g) => g.outcome === 'win').length;
  const losses = games.filter((g) => g.outcome === 'loss').length;
  const draws = games.filter((g) => g.outcome === 'draw').length;
  const accW = avg(games.filter((g) => g.color === 'w').map((g) => g.accuracy));
  const accB = avg(games.filter((g) => g.color === 'b').map((g) => g.accuracy));
  const perGame = (c: MoveClass) => avg(games.map((g) => g.counts[c] ?? 0));

  const openings = new Map<string, MyGame[]>();
  for (const g of games) {
    const k = `${g.color === 'w' ? '♔' : '♚'} ${openingFamily(g.stat.opening)}`;
    openings.set(k, [...(openings.get(k) ?? []), g]);
  }
  const openingRows = [...openings.entries()]
    .map(([name, gs]) => ({
      name,
      n: gs.length,
      acc: avg(gs.map((g) => g.accuracy)),
      score: avg(gs.map((g) => (g.outcome === 'win' ? 1 : g.outcome === 'draw' ? 0.5 : 0))) * 100,
      blunders: avg(gs.map((g) => (g.counts.blunder ?? 0) + (g.counts.mistake ?? 0))),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);

  return (
    <div className="stats">
      <div className="card">
        <h2>📊 Статистика: {names.join(', ')}</h2>
        <NamesInput />
        {games.length === 0 ? (
          <p className="hint">
            Пока нет разобранных партий с этими никами{total ? ` (всего в базе ${total})` : ''}. Проанализируйте свои партии на главной —
            можно сразу пачкой кнопкой «Проанализировать последние».
          </p>
        ) : (
          <div className="stat-tiles">
            <div className="tile">
              <b>{games.length}</b>
              <span>партий</span>
            </div>
            <div className="tile">
              <b>
                <span className="c-win">{wins}</span> / <span className="c-draw">{draws}</span> /{' '}
                <span className="c-loss">{losses}</span>
              </b>
              <span>побед / ничьих / поражений</span>
            </div>
            <div className="tile">
              <b>{avg(games.map((g) => g.accuracy)).toFixed(1)}%</b>
              <span>средняя точность</span>
            </div>
            <div className="tile">
              <b>
                {accW ? accW.toFixed(1) : '—'} / {accB ? accB.toFixed(1) : '—'}
              </b>
              <span>белыми / чёрными</span>
            </div>
          </div>
        )}
      </div>

      {games.length > 0 && (
        <>
          <div className="card">
            <h2>Точность по партиям</h2>
            <AccuracyChart games={games} />
            <p className="hint">Зелёная линия — среднее по 5 последним партиям. Точки: победа, поражение, ничья.</p>
          </div>

          <div className="card">
            <h2>Ходов за партию в среднем</h2>
            <table className="stat-table">
              <tbody>
                {CLASS_ORDER.map((c) => (
                  <tr key={c}>
                    <td className="ct-label">
                      <ClassIcon cls={c} size={18} />
                      <span>{CLASS_INFO[c].label}</span>
                    </td>
                    <td className="bar-cell">
                      <div
                        className="bar"
                        style={{ width: `${Math.min(100, perGame(c) * 6)}%`, background: CLASS_INFO[c].color }}
                      />
                    </td>
                    <td className="num">{perGame(c).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Дебюты</h2>
            <div className="table-scroll">
              <table className="stat-table openings">
                <thead>
                  <tr>
                    <th>Дебют</th>
                    <th>Партий</th>
                    <th>Очки</th>
                    <th>Точность</th>
                    <th>Ошибок+зевков</th>
                  </tr>
                </thead>
                <tbody>
                  {openingRows.map((o) => (
                    <tr key={o.name}>
                      <td>{o.name}</td>
                      <td className="num">{o.n}</td>
                      <td className="num">{o.score.toFixed(0)}%</td>
                      <td className="num">{o.acc.toFixed(1)}</td>
                      <td className="num">{o.blunders.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Партии</h2>
            <ul className="saved-list">
              {[...games].reverse().map((g) => (
                <li key={g.stat.id}>
                  <button className="saved-item" onClick={() => onOpenGame(g.stat.id)}>
                    <span>
                      <span className={`c-${g.outcome}`}>●</span> {g.stat.white} — {g.stat.black} <b>{g.stat.result}</b>
                    </span>
                    <small>
                      Точность {g.accuracy.toFixed(1)}% · {openingFamily(g.stat.opening)} ·{' '}
                      {new Date(g.stat.date).toLocaleDateString('ru-RU')}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {total > 0 && (
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (confirm('Удалить всю статистику? Сами разборы останутся.')) {
              clearStats();
              setVersion((v) => v + 1);
            }
          }}
        >
          Очистить статистику
        </button>
      )}
    </div>
  );
}

function NamesInput() {
  const s = useSettings();
  return (
    <label className="field">
      Мои ники (через запятую)
      <input value={s.myNames} onChange={(e) => updateSettings({ myNames: e.target.value })} placeholder="ник на chess.com, ник на lichess" />
    </label>
  );
}
