import { Chess } from 'chess.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { GameAnalysis, MoveAnalysis } from './types.ts';
import { CLASS_INFO } from './classify.ts';
import { formatScore } from './winrate.ts';
import { getSettings } from './settings.ts';

const SYSTEM = `Ты — дружелюбный шахматный тренер. Отвечаешь по-русски, понятно для игрока-любителя.
Опирайся только на данные движка Stockfish из запроса: не придумывай варианты, оценки и тактику, которых там нет. Если данных не хватает — так и скажи.
Ходы записывай в алгебраической нотации (SAN), как в запросе. Фигуры называй по-русски (конь, слон, ладья, ферзь, король, пешка).
Форматирование: обычный текст, можно **жирный** и списки через «- ». Без заголовков и таблиц.`;

/** Модели, у которых есть серверный запасной вариант при отказе. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

let clientPromise: Promise<{ key: string; client: Anthropic }> | null = null;

async function getClient(): Promise<Anthropic> {
  const key = getSettings().apiKey.trim();
  if (!key) throw new Error('Добавьте API-ключ Anthropic в настройках (⚙).');
  if (!clientPromise || (await clientPromise).key !== key) {
    clientPromise = import('@anthropic-ai/sdk').then(({ default: AnthropicSDK }) => ({
      key,
      // Ключ пользователя хранится только в его браузере и уходит напрямую в api.anthropic.com
      client: new AnthropicSDK({ apiKey: key, dangerouslyAllowBrowser: true }),
    }));
  }
  return (await clientPromise).client;
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Потоковый запрос к Claude. onText получает накопленный текст. */
export async function askClaude(
  messages: ChatTurn[],
  onText: (snapshot: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const client = await getClient();
  const { model } = getSettings();
  const { APIError, AuthenticationError, RateLimitError, PermissionDeniedError, BadRequestError } = await import(
    '@anthropic-ai/sdk'
  );
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 8000,
        system: SYSTEM,
        messages,
        output_config: { effort: 'low' },
        ...(FALLBACK_MODELS.has(model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { signal },
    );
    stream.on('text', (_delta, snapshot) => onText(snapshot));
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') throw new Error('Модель отказалась отвечать на этот запрос.');
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (final.stop_reason === 'max_tokens') return text + '…';
    return text;
  } catch (e) {
    if (e instanceof AuthenticationError) throw new Error('Неверный API-ключ. Проверьте его в настройках.');
    if (e instanceof PermissionDeniedError) throw new Error('У ключа нет доступа к выбранной модели.');
    if (e instanceof RateLimitError) throw new Error('Слишком много запросов — попробуйте через минуту.');
    if (e instanceof BadRequestError) throw new Error(`Ошибка запроса: ${e.message}`);
    if (e instanceof APIError) throw new Error(`Ошибка API (${e.status ?? 'сеть'}): ${e.message}`);
    throw e;
  }
}

// ---------- Построение контекста ----------

const PIECE_RU: Record<string, string> = { k: 'Кр', q: 'Ф', r: 'Л', b: 'С', n: 'К', p: 'п' };

/** Расстановка фигур словами — модели так проще, чем по одному FEN. */
function describePosition(fen: string): string {
  const c = new Chess(fen);
  const w: string[] = [];
  const b: string[] = [];
  for (const row of c.board())
    for (const sq of row) if (sq) (sq.color === 'w' ? w : b).push(PIECE_RU[sq.type] + sq.square);
  return `FEN: ${fen}\nБелые: ${w.join(', ')}\nЧёрные: ${b.join(', ')}\nХод ${c.turn() === 'w' ? 'белых' : 'чёрных'}.`;
}

function moveLabel(m: MoveAnalysis) {
  return `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`;
}

function prevScore(a: GameAnalysis, m: MoveAnalysis) {
  return m.ply > 1 ? a.moves[m.ply - 2].scoreAfter : a.startScore;
}

export function movePrompt(a: GameAnalysis, m: MoveAnalysis): string {
  const side = m.color === 'w' ? 'белые' : 'чёрные';
  const cands = m.candidates
    .map((c, i) => `${i + 1}) ${c.san} — шансы ${side} ${c.win.toFixed(0)}%`)
    .join('\n');
  const recent = a.moves
    .slice(Math.max(0, m.ply - 7), m.ply - 1)
    .map(moveLabel)
    .join(' ');
  return `Партия: ${a.white.name} (белые) — ${a.black.name} (чёрные). ${a.opening ? 'Дебют: ' + a.opening + '.' : ''}
Последние ходы перед этим: ${recent || '—'}

Позиция перед ходом:
${describePosition(m.fenBefore)}

Сыграно: ${moveLabel(m)} (${side}). Оценка программы: «${CLASS_INFO[m.cls].label}».
Оценка Stockfish (со стороны белых): до хода ${formatScore(prevScore(a, m))}, после хода ${formatScore(m.scoreAfter)}. Потеря шансов: ${m.loss.toFixed(1)}%.
Лучшие ходы по движку:
${cands || '—'}
Главный вариант движка: ${m.bestLine.join(' ') || '—'}

Объясни в 2–4 предложениях: в чём идея сыгранного хода и почему он получил такую оценку; если был ход лучше — в чём его идея.`;
}

export function gamePrompt(a: GameAnalysis, me?: 'w' | 'b'): string {
  const key = a.moves
    .filter((m) => ['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(m.cls))
    .slice(0, 20)
    .map(
      (m) =>
        `- ${moveLabel(m)} (${m.color === 'w' ? 'белые' : 'чёрные'}): ${CLASS_INFO[m.cls].label}; оценка ${formatScore(
          prevScore(a, m),
        )} → ${formatScore(m.scoreAfter)}${m.bestSan && m.bestUci !== m.uci ? `; лучше было ${m.bestSan}` : ''}`,
    )
    .join('\n');
  const counts = (c: 'w' | 'b') =>
    Object.entries(a.counts[c])
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${CLASS_INFO[k as keyof typeof CLASS_INFO].label}: ${n}`)
      .join(', ');
  const pgn = a.moves.map((m) => (m.color === 'w' ? `${m.moveNumber}. ${m.san}` : m.san)).join(' ');
  return `Партия: ${a.white.name}${a.white.rating ? ` (${a.white.rating})` : ''} — ${a.black.name}${
    a.black.rating ? ` (${a.black.rating})` : ''
  }, результат ${a.result}. ${a.opening ? 'Дебют: ' + a.opening + '.' : ''}
Ходы: ${pgn}

Точность: белые ${a.accuracy.w.toFixed(1)}%, чёрные ${a.accuracy.b.toFixed(1)}%.
Ходы белых: ${counts('w')}
Ходы чёрных: ${counts('b')}
Ключевые моменты по Stockfish:
${key || '—'}

${me ? `Я играл ${me === 'w' ? 'белыми' : 'чёрными'}. ` : ''}Сделай разбор партии:
1) общий ход борьбы — 2–3 предложения;
2) 2–3 главных поворотных момента и что там надо было делать;
3) 3 конкретных совета, над чем мне поработать.`;
}

export function questionContext(a: GameAnalysis, ply: number): string {
  const m = ply > 0 ? a.moves[ply - 1] : null;
  const fen = m ? m.fenAfter : a.startFen;
  const next = a.moves[ply];
  return `Партия: ${a.white.name} — ${a.black.name}, ${a.result}. ${a.opening ? 'Дебют: ' + a.opening + '.' : ''}
${m ? `Последний ход: ${moveLabel(m)} («${CLASS_INFO[m.cls].label}»), оценка Stockfish ${formatScore(m.scoreAfter)}.` : 'Начальная позиция.'}
Текущая позиция:
${describePosition(fen)}
${next ? `Лучший ход здесь по движку: ${next.bestSan ?? '—'}; вариант: ${next.bestLine.join(' ') || '—'}. В партии сыграно: ${next.san}.` : ''}`;
}

// ---------- Кэш ответов ----------

export function getCachedAi(key: string): string | null {
  try {
    return localStorage.getItem(`ai:${key}`);
  } catch {
    return null;
  }
}
export function setCachedAi(key: string, text: string) {
  try {
    localStorage.setItem(`ai:${key}`, text);
  } catch {
    /* переполнено — не критично */
  }
}
