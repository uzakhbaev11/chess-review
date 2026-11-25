import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';

/** Модели, которые работают прямо в браузере через WebGPU. */
export const LOCAL_MODELS = [
  { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen 3.5 4B — лучшее качество (~2.5 ГБ, нужно ~4 ГБ видеопамяти)', thinking: true },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen 3.5 2B — для слабых видеокарт (~1.5 ГБ)', thinking: true },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 3B — запасной вариант (~2 ГБ)', thinking: false },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B — самая лёгкая (~1 ГБ), слабая', thinking: false },
];
export const DEFAULT_LOCAL_MODEL = 'Qwen3.5-4B-q4f16_1-MLC';

export type LoadStatus = { text: string; progress: number } | null;

let engine: WebWorkerMLCEngine | null = null;
let loadedModel: string | null = null;
let loading: Promise<WebWorkerMLCEngine> | null = null;
const statusListeners = new Set<(s: LoadStatus) => void>();
let status: LoadStatus = null;

function setStatus(s: LoadStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

export function onLoadStatus(cb: (s: LoadStatus) => void): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

export async function checkWebGpu(): Promise<string | null> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return 'Ваш браузер не поддерживает WebGPU. Откройте сайт в Chrome или Edge на компьютере (или в свежем Safari).';
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return 'WebGPU недоступен: видеокарта не найдена или отключена в браузере.';
  } catch {
    return 'WebGPU недоступен в этом браузере.';
  }
  return null;
}

/** Загружает (или переиспользует) модель. Первый раз скачивает её в кэш браузера. */
export async function getLocalEngine(model: string): Promise<WebWorkerMLCEngine> {
  if (engine && loadedModel === model) return engine;
  if (loading) await loading.catch(() => undefined);
  if (engine && loadedModel === model) return engine;

  loading = (async () => {
    const gpuError = await checkWebGpu();
    if (gpuError) throw new Error(gpuError);
    const progressCb = (r: { progress: number; text: string }) =>
      setStatus({ progress: r.progress, text: humanize(r.text, r.progress) });
    setStatus({ progress: 0, text: 'Подготовка модели…' });
    if (engine) {
      await engine.reload(model);
    } else {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      const worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
      engine = await CreateWebWorkerMLCEngine(worker, model, { initProgressCallback: progressCb });
    }
    loadedModel = model;
    setStatus(null);
    return engine;
  })();
  try {
    return await loading;
  } catch (e) {
    setStatus(null);
    throw new Error(
      e instanceof Error && /memory|device|lost|OOM/i.test(e.message)
        ? 'Не хватило видеопамяти. Выберите модель поменьше в настройках.'
        : e instanceof Error
          ? e.message
          : String(e),
    );
  } finally {
    loading = null;
  }
}

function humanize(text: string, progress: number): string {
  const pct = Math.round(progress * 100);
  if (/cache/i.test(text) && /load/i.test(text)) return `Загрузка модели из кэша… ${pct}%`;
  if (/fetch|download/i.test(text)) return `Скачивание модели (один раз)… ${pct}%`;
  if (/shader|compil|GPU/i.test(text)) return 'Подготовка видеокарты…';
  return `Загрузка модели… ${pct}%`;
}

export async function localChat(
  model: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  onText: (snapshot: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const eng = await getLocalEngine(model);
  const info = LOCAL_MODELS.find((m) => m.id === model);
  const onAbort = () => eng.interruptGenerate();
  signal?.addEventListener('abort', onAbort);
  try {
    const stream = await eng.chat.completions.create({
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
      temperature: 0.4,
      max_tokens: 700,
      ...(info?.thinking ? { extra_body: { enable_thinking: false } } : {}),
    });
    let text = '';
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? '';
      onText(stripThink(text));
    }
    return stripThink(text);
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Убирает блок размышлений <think>…</think>, если модель всё же его выдала. */
function stripThink(t: string): string {
  return t.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart();
}
