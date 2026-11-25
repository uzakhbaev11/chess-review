import { useRef, useState } from 'react';
import { Home } from './components/Home.tsx';
import { Review } from './components/Review.tsx';
import { analyzeGame, hashString, parsePgn } from './lib/analyze.ts';
import { createBrowserEngine, type Engine } from './lib/engine.ts';
import { loadOpenings } from './lib/openings.ts';
import { loadSaved, saveAnalysis } from './lib/storage.ts';
import type { Color, GameAnalysis } from './lib/types.ts';

type View =
  | { kind: 'home' }
  | { kind: 'analyzing'; done: number; total: number }
  | { kind: 'review'; analysis: GameAnalysis; orientation: Color };

function orientationFor(a: GameAnalysis, me?: string): Color {
  return me && a.black.name.toLowerCase() === me.toLowerCase() ? 'b' : 'w';
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = async (pgn: string, depth: number, me?: string) => {
    setError(null);
    try {
      parsePgn(pgn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const cached = loadSaved(hashString(pgn.trim() + '|' + depth));
    if (cached) {
      setView({ kind: 'review', analysis: cached, orientation: orientationFor(cached, me) });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setView({ kind: 'analyzing', done: 0, total: 1 });
    try {
      engineRef.current ??= createBrowserEngine();
      const lookupOpening = await loadOpenings();
      const analysis = await analyzeGame(pgn, engineRef.current, {
        depth,
        lookupOpening,
        signal: controller.signal,
        onProgress: (done, total) => {
          if (!controller.signal.aborted) setView({ kind: 'analyzing', done, total });
        },
      });
      saveAnalysis(analysis);
      setView({ kind: 'review', analysis, orientation: orientationFor(analysis, me) });
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setView({ kind: 'home' });
    }
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
    if (a) setView({ kind: 'review', analysis: a, orientation: 'w' });
    else setError('Разбор не найден в хранилище');
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => view.kind !== 'analyzing' && setView({ kind: 'home' })}>
          <span className="logo">♞</span> Разбор партий
        </button>
      </header>
      <main>
        {view.kind === 'home' && <Home onAnalyze={analyze} onOpenSaved={openSaved} error={error} />}
        {view.kind === 'analyzing' && (
          <div className="analyzing card">
            <div className="spinner" aria-hidden>
              ♞
            </div>
            <h2>Анализируем партию…</h2>
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
            orientation={view.orientation}
            onBack={() => setView({ kind: 'home' })}
          />
        )}
      </main>
    </div>
  );
}
