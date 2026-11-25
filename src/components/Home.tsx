import { useState } from 'react';
import { fetchChessCom, fetchLichess, TIME_CLASS_RU, type ImportedGame } from '../lib/importers.ts';
import { getPref, listSaved, removeSaved, setPref, type SavedMeta } from '../lib/storage.ts';

export const DEPTHS = [
  { value: 12, label: 'Быстро (глубина 12)' },
  { value: 15, label: 'Стандарт (глубина 15)' },
  { value: 18, label: 'Глубоко (глубина 18)' },
];

type Source = 'chess.com' | 'lichess' | 'pgn';

const SAMPLE_PGN = `[Event "Opera Game"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export function Home({
  onAnalyze,
  onOpenSaved,
  error,
}: {
  onAnalyze: (pgn: string, depth: number, me?: string) => void;
  onOpenSaved: (id: string) => void;
  error: string | null;
}) {
  const [source, setSource] = useState<Source>(() => getPref('source', 'chess.com') as Source);
  const [username, setUsername] = useState(() => getPref(`user:${getPref('source', 'chess.com')}`, ''));
  const [pgn, setPgn] = useState('');
  const [depth, setDepth] = useState(() => Number(getPref('depth', '15')));
  const [games, setGames] = useState<ImportedGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedMeta[]>(() => listSaved());

  const switchSource = (s: Source) => {
    setSource(s);
    setPref('source', s);
    setGames(null);
    setFetchError(null);
    if (s !== 'pgn') setUsername(getPref(`user:${s}`, ''));
  };

  const load = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setFetchError(null);
    setGames(null);
    setPref(`user:${source}`, username.trim());
    try {
      const list = source === 'chess.com' ? await fetchChessCom(username) : await fetchLichess(username);
      setGames(list);
      if (!list.length) setFetchError('Партий не найдено');
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const changeDepth = (d: number) => {
    setDepth(d);
    setPref('depth', String(d));
  };

  return (
    <div className="home">
      <section className="hero">
        <h1>
          <span className="logo">♞</span> Разбор партий
        </h1>
        <p>
          Блестящие ходы, ошибки, зевки и точность — как в отчёте chess.com. Анализ идёт прямо в вашем браузере на
          Stockfish&nbsp;19.
        </p>
      </section>

      <section className="card">
        <div className="tabs">
          {(['chess.com', 'lichess', 'pgn'] as Source[]).map((s) => (
            <button key={s} className={`tab ${source === s ? 'active' : ''}`} onClick={() => switchSource(s)}>
              {s === 'pgn' ? 'PGN' : s === 'chess.com' ? 'Chess.com' : 'Lichess'}
            </button>
          ))}
        </div>

        <label className="depth-select">
          Глубина анализа:
          <select value={depth} onChange={(e) => changeDepth(Number(e.target.value))}>
            {DEPTHS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {source === 'pgn' ? (
          <div className="pgn-form">
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder="Вставьте PGN партии…"
              rows={10}
              spellCheck={false}
            />
            <div className="row">
              <button className="btn" onClick={() => setPgn(SAMPLE_PGN)}>
                Пример: «Оперная партия»
              </button>
              <button className="btn btn-primary" disabled={!pgn.trim()} onClick={() => onAnalyze(pgn, depth)}>
                Анализировать
              </button>
            </div>
          </div>
        ) : (
          <>
            <form className="user-form" onSubmit={load}>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={`Ник на ${source}`}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn btn-primary" disabled={loading || !username.trim()}>
                {loading ? 'Загрузка…' : 'Найти партии'}
              </button>
            </form>
            {fetchError && <div className="error">{fetchError}</div>}
            {games && games.length > 0 && (
              <ul className="game-list">
                {games.slice(0, 60).map((g) => {
                  const meWhite = g.white.toLowerCase() === username.trim().toLowerCase();
                  return (
                    <li key={g.id}>
                      <button className="game-item" onClick={() => onAnalyze(g.pgn, depth, username.trim())}>
                        <span className={`outcome ${g.outcome}`}>
                          {g.outcome === 'win' ? 'Победа' : g.outcome === 'loss' ? 'Поражение' : 'Ничья'}
                        </span>
                        <span className="gi-players">
                          <span className={meWhite ? 'me' : ''}>
                            ♔ {g.white} {g.whiteRating && <small>{g.whiteRating}</small>}
                          </span>
                          <span className={!meWhite ? 'me' : ''}>
                            ♚ {g.black} {g.blackRating && <small>{g.blackRating}</small>}
                          </span>
                        </span>
                        <span className="gi-meta">
                          <span>{TIME_CLASS_RU[g.timeClass] ?? g.timeClass}</span>
                          <span>{new Date(g.endTime).toLocaleDateString('ru-RU')}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      {saved.length > 0 && (
        <section className="card">
          <h2>Недавние разборы</h2>
          <ul className="saved-list">
            {saved.map((s) => (
              <li key={s.id}>
                <button className="saved-item" onClick={() => onOpenSaved(s.id)}>
                  <span>
                    {s.white} — {s.black} <b>{s.result}</b>
                  </span>
                  <small>
                    {s.opening ? `${s.opening} · ` : ''}
                    {new Date(s.createdAt).toLocaleDateString('ru-RU')}
                  </small>
                </button>
                <button
                  className="btn btn-ghost"
                  aria-label="Удалить"
                  onClick={() => {
                    removeSaved(s.id);
                    setSaved(listSaved());
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="footer">
        Движок: Stockfish 19 (WASM). Дебюты: lichess-org/chess-openings. Управление: ← → по ходам, F — перевернуть доску.
      </footer>
    </div>
  );
}
