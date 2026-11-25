import { useRef, useState } from 'react';
import { Home } from './components/Home.tsx';
import { Review } from './components/Review.tsx';
import { Stats } from './components/Stats.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { analyzeGame, hashString, parsePgn } from './lib/analyze.ts';
import { createBrowserEngine, type Engine } from './lib/engine.ts';
import { loadOpenings } from './lib/openings.ts';
import { loadSaved, saveAnalysis } from './lib/storage.ts';
import { recordStats } from './lib/stats.ts';
import { myNameList, rememberMyName } from './lib/settings.ts';
import type { Color, GameAnalysis } from './lib/types.ts';

type View =
  | { kind: 'home' }
  | { kind: 'stats' }
  | { kind: 'analyzing'; done: number; total: number; game?: number; games?: number }
  | { kind: 'review'; analysis: GameAnalysis };

/** Цвет «моих» фигур в партии по списку ников (или undefined). */
function myColor(a: GameAnalysis): Color | undefined {
  const names = myNameList();
  if (names.includes(a.white.name.toLowerCase())) return 'w';
  if (names.includes(a.black.name.toLowerCase())) return 'b';
  return undefined;
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /** Анализ одной партии (или из кэша). */
  const runOne = async (
    pgn: string,
    depth: number,
    controller: AbortController,
    onProgress: (done: number, total: number) => void,
  ): Promise<GameAnalysis> => {
    const cached = loadSaved(hashString(pgn.trim() + '|' + depth));
    if (cached) {
      recordStats(cached);
      return cached;
    }
    engineRef.current ??= createBrowserEngine();
    const lookupOpening = await loadOpenings();
    const analysis = await analyzeGame(pgn, engineRef.current, {
      depth,
      lookupOpening,
      signal: controller.signal,
      onProgress,
    });
    saveAnalysis(analysis);
    recordStats(analysis);
    return analysis;
  };

  const analyze = async (pgn: string, depth: number, me?: string) => {
    setError(null);
    try {
      parsePgn(pgn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (me) rememberMyName(me);
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ kind: 'analyzing', done: 0, total: 1 });
    try {
      const analysis = await runOne(pgn, depth, controller, (done, total) => {
        if (!controller.signal.aborted) setView({ kind: 'analyzing', done, total });
      });
      if (!controller.signal.aborted) setView({ kind: 'review', analysis });
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setView({ kind: 'home' });
    }
  };

  const analyzeBatch = async (pgns: string[], depth: number) => {
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    let failed = 0;
    for (let i = 0; i < pgns.length; i++) {
      if (controller.signal.aborted) return;
      setView({ kind: 'analyzing', done: 0, total: 1, game: i + 1, games: pgns.length });
      try {
        await runOne(pgns[i], depth, controller, (done, total) => {
          if (!controller.signal.aborted) setView({ kind: 'analyzing', done, total, game: i + 1, games: pgns.length });
        });
      } catch {
        if (controller.signal.aborted) return;
        failed++;
      }
    }
    if (failed) setError(`Не удалось разобрать партий: ${failed}`);
    setView({ kind: 'stats' });
  };

  const cancel = () => {
    abortRef.current?.abort();
    // Движок может быть занят долгим расчётом — проще перезапустить
    engineRef.current?.terminate();
    engineRef.current = null;
    setView({ kind: 'home' });
  };

  const openSaved = (id: string) => {
    const a = loadSaved(id);
    if (a) setView({ kind: 'review', analysis: a });
    else setError('Полный разбор этой партии вытеснен из хранилища — проанализируйте её заново.');
  };

  const busy = view.kind === 'analyzing';
  const nav = (v: View) => !busy && setView(v);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => nav({ kind: 'home' })}>
          <span className="logo">♞</span> <span className="brand-text">Разбор партий</span>
        </button>
        <nav className="topnav">
          <button className={`navlink ${view.kind === 'home' ? 'active' : ''}`} onClick={() => nav({ kind: 'home' })}>
            Партии
          </button>
          <button className={`navlink ${view.kind === 'stats' ? 'active' : ''}`} onClick={() => nav({ kind: 'stats' })}>
            📊 Статистика
          </button>
          <button className="navlink" onClick={() => setSettingsOpen(true)} aria-label="Настройки">
            ⚙
          </button>
        </nav>
      </header>
      <main>
        {view.kind === 'home' && <Home onAnalyze={analyze} onBatch={analyzeBatch} onOpenSaved={openSaved} error={error} />}
        {view.kind === 'stats' && (
          <>
            {error && <div className="error stats-error">{error}</div>}
            <Stats onOpenGame={openSaved} />
          </>
        )}
        {view.kind === 'analyzing' && (
          <div className="analyzing card">
            <div className="spinner" aria-hidden>
              ♞
            </div>
            <h2>{view.games ? `Партия ${view.game} из ${view.games}` : 'Анализируем партию…'}</h2>
            <div className="progress">
              <div className="progress-fill" style={{ width: `${(view.done / view.total) * 100}%` }} />
            </div>
            <p>
              Позиция {view.done} из {view.total}
            </p>
            <button className="btn" onClick={cancel}>
              Отмена
            </button>
          </div>
        )}
        {view.kind === 'review' && (
          <Review
            key={view.analysis.id}
            analysis={view.analysis}
            orientation={myColor(view.analysis) ?? 'w'}
            me={myColor(view.analysis)}
            onBack={() => setView({ kind: 'home' })}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}
      </main>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
