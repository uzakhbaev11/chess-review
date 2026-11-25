export interface ImportedGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  /** Результат с точки зрения запрошенного игрока. */
  outcome: 'win' | 'loss' | 'draw';
  timeClass: string;
  endTime: number;
  url?: string;
  source: 'chess.com' | 'lichess';
}

const DRAW_RESULTS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

interface ChessComPlayer {
  username: string;
  rating: number;
  result: string;
}
interface ChessComGame {
  url: string;
  pgn?: string;
  end_time: number;
  time_class: string;
  rules: string;
  white: ChessComPlayer;
  black: ChessComPlayer;
}

/** Последние партии игрока с chess.com (публичный API, без ключа). */
export async function fetchChessCom(username: string, months = 2): Promise<ImportedGame[]> {
  const user = username.trim().toLowerCase();
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`);
  if (res.status === 404) throw new Error('Игрок не найден на chess.com');
  if (!res.ok) throw new Error(`Ошибка chess.com: ${res.status}`);
  const { archives } = (await res.json()) as { archives: string[] };
  const recent = archives.slice(-months).reverse();
  const games: ImportedGame[] = [];
  for (const url of recent) {
    const r = await fetch(url);
    if (!r.ok) continue;
    const data = (await r.json()) as { games: ChessComGame[] };
    for (const g of data.games) {
      if (!g.pgn || g.rules !== 'chess') continue;
      const isWhite = g.white.username.toLowerCase() === user;
      const me = isWhite ? g.white : g.black;
      games.push({
        id: g.url,
        pgn: g.pgn,
        white: g.white.username,
        black: g.black.username,
        whiteRating: g.white.rating,
        blackRating: g.black.rating,
        outcome: me.result === 'win' ? 'win' : DRAW_RESULTS.has(me.result) ? 'draw' : 'loss',
        timeClass: g.time_class,
        endTime: g.end_time * 1000,
        url: g.url,
        source: 'chess.com',
      });
    }
  }
  return games.sort((a, b) => b.endTime - a.endTime);
}

interface LichessGame {
  id: string;
  speed: string;
  variant: string;
  lastMoveAt: number;
  winner?: 'white' | 'black';
  pgn: string;
  players: {
    white: { user?: { name: string }; rating?: number };
    black: { user?: { name: string }; rating?: number };
  };
}

/** Последние партии игрока с lichess. */
export async function fetchLichess(username: string, max = 40): Promise<ImportedGame[]> {
  const user = username.trim();
  const res = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&pgnInJson=true&clocks=false&evals=false`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  if (res.status === 404) throw new Error('Игрок не найден на lichess');
  if (!res.ok) throw new Error(`Ошибка lichess: ${res.status}`);
  const text = await res.text();
  const games: ImportedGame[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as LichessGame;
    if (g.variant !== 'standard') continue;
    const white = g.players.white.user?.name ?? 'Аноним';
    const black = g.players.black.user?.name ?? 'Аноним';
    const isWhite = white.toLowerCase() === user.toLowerCase();
    games.push({
      id: g.id,
      pgn: g.pgn,
      white,
      black,
      whiteRating: g.players.white.rating,
      blackRating: g.players.black.rating,
      outcome: !g.winner ? 'draw' : (g.winner === 'white') === isWhite ? 'win' : 'loss',
      timeClass: g.speed,
      endTime: g.lastMoveAt,
      url: `https://lichess.org/${g.id}`,
      source: 'lichess',
    });
  }
  return games;
}

export const TIME_CLASS_RU: Record<string, string> = {
  bullet: 'Пуля',
  blitz: 'Блиц',
  rapid: 'Рапид',
  daily: 'Заочные',
  classical: 'Классика',
  correspondence: 'Заочные',
  ultraBullet: 'Ультрапуля',
};
