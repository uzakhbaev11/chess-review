import { useEffect, useRef, useState } from 'react';
import type { GameAnalysis, MoveAnalysis } from '../lib/types.ts';
import { askAi, gamePrompt, getCachedAi, movePrompt, questionContext, setCachedAi, type ChatTurn } from '../lib/ai.ts';
import { isAiReady, useSettings } from '../lib/settings.ts';
import { onLoadStatus, type LoadStatus } from '../lib/localAi.ts';

function LocalNote() {
  return (
    <span className="ai-note" title="Небольшая модель работает в вашем браузере и иногда ошибается в шахматных деталях. Главное — оценка Stockfish.">
      {' '}
      · модель в браузере, может ошибаться
    </span>
  );
}

/** Индикатор «Думаю…» или прогресс загрузки локальной модели. */
function Thinking({ label = 'Думаю…' }: { label?: string }) {
  const [st, setSt] = useState<LoadStatus>(null);
  useEffect(() => onLoadStatus(setSt), []);
  if (st)
    return (
      <div className="ai-loading">
        <div>{st.text}</div>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${Math.round(st.progress * 100)}%` }} />
        </div>
      </div>
    );
  return <div className="ai-typing">{label}</div>;
}

/** Мини-рендер: абзацы, списки «- », «1.», и **жирный**. Без HTML — только React-узлы. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length}>
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^#+\s*/, '');
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="md">{blocks}</div>;
}

function useAiRequest(cacheKey: string | null) {
  const [text, setText] = useState<string | null>(() => (cacheKey ? getCachedAi(cacheKey) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setText(cacheKey ? getCachedAi(cacheKey) : null);
    setError(null);
    setLoading(false);
    return () => abortRef.current?.abort();
  }, [cacheKey]);

  const run = async (prompt: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setText('');
    try {
      const result = await askAi([{ role: 'user', content: prompt }], (s) => setText(s), controller.signal);
      setText(result);
      if (cacheKey) setCachedAi(cacheKey, result);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setText(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  return { text, loading, error, run };
}

function NeedKey({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="ai-need-key">
      {useSettings().aiProvider === 'claude' ? 'Не указан API-ключ Claude.' : 'ИИ-тренер выключен.'}{' '}
      <button className="link" onClick={onOpenSettings}>
        Открыть настройки
      </button>
    </div>
  );
}

/** Кнопка «Объяснить ход» и ответ ИИ. */
export function AiMoveExplain({
  analysis,
  move,
  onOpenSettings,
}: {
  analysis: GameAnalysis;
  move: MoveAnalysis;
  onOpenSettings: () => void;
}) {
  const settings = useSettings();
  const { text, loading, error, run } = useAiRequest(`${analysis.id}:${move.ply}:${settings.aiProvider === 'local' ? settings.localModel : settings.model}`);
  if (!settings.aiEnabled) return null;
  return (
    <div className="ai-box">
      {!isAiReady(settings) ? (
        <NeedKey onOpenSettings={onOpenSettings} />
      ) : text === null && !loading ? (
        <button className="btn btn-small btn-ai" onClick={() => run(movePrompt(analysis, move))}>
          ✨ Объяснить ход (ИИ)
        </button>
      ) : (
        <>
          <div className="ai-label">✨ ИИ-тренер{settings.aiProvider === 'local' && <LocalNote />}</div>
          {text ? <Markdown text={text} /> : <Thinking />}
          {!loading && text && (
            <button className="link" onClick={() => run(movePrompt(analysis, move))}>
              Обновить
            </button>
          )}
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

/** Общий разбор партии от ИИ (во вкладке «Сводка»). */
export function AiGameReview({
  analysis,
  me,
  onOpenSettings,
}: {
  analysis: GameAnalysis;
  me?: 'w' | 'b';
  onOpenSettings: () => void;
}) {
  const settings = useSettings();
  const { text, loading, error, run } = useAiRequest(`${analysis.id}:review:${me ?? ''}:${settings.aiProvider === 'local' ? settings.localModel : settings.model}`);
  if (!settings.aiEnabled) return null;
  return (
    <div className="ai-box ai-review">
      <div className="ai-label">✨ Разбор от ИИ-тренера{settings.aiProvider === 'local' && <LocalNote />}</div>
      {!isAiReady(settings) ? (
        <NeedKey onOpenSettings={onOpenSettings} />
      ) : text === null && !loading ? (
        <button className="btn btn-ai btn-wide" onClick={() => run(gamePrompt(analysis, me))}>
          Получить разбор партии
        </button>
      ) : text ? (
        <>
          <Markdown text={text} />
          {!loading && (
            <button className="link" onClick={() => run(gamePrompt(analysis, me))}>
              Обновить
            </button>
          )}
        </>
      ) : (
        <Thinking label="Анализирую партию…" />
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

/** Чат с тренером по текущей позиции. */
export function AiChat({ analysis, ply, onOpenSettings }: { analysis: GameAnalysis; ply: number; onOpenSettings: () => void }) {
  const settings = useSettings();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setTurns([]);
    setStreaming(null);
    setError(null);
  }, [ply, analysis.id]);

  if (!settings.aiEnabled) return null;
  if (!isAiReady(settings))
    return (
      <div className="ai-box">
        <NeedKey onOpenSettings={onOpenSettings} />
      </div>
    );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || streaming !== null) return;
    const history: ChatTurn[] = [...turns, { role: 'user', content: q }];
    setTurns(history);
    setInput('');
    setError(null);
    setStreaming('');
    const controller = new AbortController();
    abortRef.current = controller;
    // Контекст позиции добавляем к первому вопросу
    const payload: ChatTurn[] = history.map((t, i) =>
      i === 0 ? { role: 'user', content: `${questionContext(analysis, ply)}\n\nВопрос: ${t.content}` } : t,
    );
    try {
      const answer = await askAi(payload, (s) => setStreaming(s), controller.signal);
      setTurns([...history, { role: 'assistant', content: answer }]);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setTurns(turns);
      setInput(q);
    } finally {
      if (!controller.signal.aborted) setStreaming(null);
    }
  };

  return (
    <div className="ai-box ai-chat">
      <div className="ai-label">💬 Спросить тренера об этой позиции</div>
      {turns.map((t, i) => (
        <div key={i} className={`chat-msg ${t.role}`}>
          {t.role === 'assistant' ? <Markdown text={t.content} /> : t.content}
        </div>
      ))}
      {streaming !== null && (
        <div className="chat-msg assistant">{streaming ? <Markdown text={streaming} /> : <Thinking />}</div>
      )}
      {error && <div className="error">{error}</div>}
      <form className="chat-form" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Например: почему нельзя взять пешку?"
          disabled={streaming !== null}
        />
        <button className="btn btn-ai" disabled={!input.trim() || streaming !== null}>
          ➤
        </button>
      </form>
    </div>
  );
}
