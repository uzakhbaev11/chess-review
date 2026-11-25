import { Chess } from 'chess.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { GameAnalysis, MoveAnalysis } from './types.ts';
import { CLASS_INFO } from './classify.ts';
import { formatScore } from './winrate.ts';
import { getSettings } from './settings.ts';
import { localChat } from './localAi.ts';
import { lineFacts, moveFacts } from './facts.ts';

const SYSTEM = `Ты — дружелюбный шахматный тренер. Отвечаешь по-русски, понятно для игрока-любителя.
Опирайся только на данные движка Stockfish из запроса: не придумывай варианты, оценки и тактику, которых там нет. Если данных не хватает — так и скажи.
Ходы записывай в алгебраической нотации (SAN), как в запросе. Фигуры называй по-русски (конь, слон, ладья, ферзь, король, пешка).
Форматирование: обычный текст, можно **жирный** и списки через «- ». Без заголовков и таблиц. Пиши кратко, без воды.`;

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

/** Запрос к выбранному ИИ (локальная модель или Claude). onText получает накопленный текст. */
export async function askAi(
  messages: ChatTurn[],
  onText: (snapshot: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const s = getSettings();
  if (s.aiProvider === 'local') return localChat(s.localModel, SYSTEM, messages, onText, signal);
  return askClaude(messages, onText, signal);
}

/** Потоковый запрос к Claude. onText получает накопленный текст. */
async function askClaude(
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
  const oppSide = m.color === 'w' ? 'чёрных' : 'белых';
  const played = moveFacts(m.fenBefore, m.san);
  const reply = a.moves[m.ply]; // ход соперника после этого: его лучшая линия = опровержение
  const replyLine = reply ? lineFacts(m.fenAfter, reply.bestLine, 2) : [];
  const isBest = m.bestUci === m.uci;
  const bestLine = !isBest && m.bestLine.length ? lineFacts(m.fenBefore, m.bestLine, 3) : [];
  const claude = getSettings().aiProvider === 'claude';

  return `${a.opening ? 'Дебют: ' + a.opening + '.\n' : ''}Ход ${moveLabel(m)} (играли ${side}). Оценка программы: «${CLASS_INFO[m.cls].label}»${
    m.loss >= 2 ? `, потеря шансов на победу ${m.loss.toFixed(0)}%` : ''
  }.
Оценка Stockfish (плюс — лучше белым): до хода ${formatScore(prevScore(a, m))}, после хода ${formatScore(m.scoreAfter)}.

ФАКТЫ о сыгранном ходе: ${played?.text ?? m.san}
${replyLine.length ? `Лучшее продолжение для ${oppSide} после этого хода: ${replyLine.join(' → ')}` : ''}
${isBest ? 'Это был лучший ход по мнению движка.' : bestLine.length ? `Лучше было: ${bestLine.join(' → ')}` : ''}
${claude ? '\nПозиция перед ходом:\n' + describePosition(m.fenBefore) : ''}
Задача: объясни игроку в 2–3 коротких предложениях, почему ход «${m.san}» получил оценку «${CLASS_INFO[m.cls].label}»${
    isBest ? '' : ' и чем лучше рекомендованный ход'
  }. Используй только ФАКТЫ выше, не придумывай другие ходы, фигуры и поля.`.replace(/\n{3,}/g, '\n\n');
}

export function gamePrompt(a: GameAnalysis, me?: 'w' | 'b'): string {
  const key = a.moves
    .filter((m) => ['brilliant', 'great', 'mistake', 'miss', 'blunder'].includes(m.cls))
    .slice(0, getSettings().aiProvider === 'claude' ? 20 : 8)
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
  // Локальной модели с маленьким контекстом не даём всю запись партии
  const pgn =
    getSettings().aiProvider === 'claude'
      ? a.moves.map((m) => (m.color === 'w' ? `${m.moveNumber}. ${m.san}` : m.san)).join(' ')
      : `${a.moves.length} полуходов`;
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
  const lastFacts = m ? moveFacts(m.fenBefore, m.san)?.text : null;
  const best = next?.bestLine.length ? lineFacts(fen, next.bestLine, 3) : [];
  return `Партия: ${a.white.name} — ${a.black.name}, ${a.result}. ${a.opening ? 'Дебют: ' + a.opening + '.' : ''}
${m ? `Последний ход: ${moveLabel(m)} («${CLASS_INFO[m.cls].label}»), оценка Stockfish ${formatScore(m.scoreAfter)} (плюс — лучше белым).` : 'Начальная позиция.'}
${lastFacts ? `ФАКТЫ о последнем ходе: ${lastFacts}` : ''}
${best.length ? `Лучшее продолжение по движку: ${best.join(' → ')}` : ''}
${next ? `В партии дальше сыграно: ${next.san}.` : ''}
Текущая позиция (используй только эти фигуры и поля):
${describePosition(fen)}
Отвечай коротко и опирайся только на ФАКТЫ и расстановку выше.`;
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
