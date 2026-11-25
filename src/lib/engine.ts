/** Транспорт к UCI-движку: Web Worker в браузере или процесс в Node (для тестов). */
export interface Transport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  terminate(): void;
}

export interface RawLine {
  multipv: number;
  depth: number;
  /** С точки зрения стороны, которая ходит. */
  cp: number | null;
  mate: number | null;
  pv: string[];
}

export class Engine {
  private transport: Transport;
  private listeners = new Set<(line: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void>;

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onLine((raw) => {
      for (const line of raw.split('\n')) {
        const l = line.trim();
        if (l) this.listeners.forEach((f) => f(l));
      }
    });
    this.ready = (async () => {
      const ok = this.waitFor((l) => l === 'uciok');
      transport.send('uci');
      await ok;
      transport.send('setoption name Hash value 64');
      await this.isReady();
    })();
  }

  private waitFor(pred: (l: string) => boolean): Promise<string> {
    return new Promise((resolve) => {
      const f = (l: string) => {
        if (pred(l)) {
          this.listeners.delete(f);
          resolve(l);
        }
      };
      this.listeners.add(f);
    });
  }

  private async isReady() {
    const p = this.waitFor((l) => l === 'readyok');
    this.transport.send('isready');
    await p;
  }

  /** Анализ позиции. Запросы выполняются строго по очереди. */
  analyse(fen: string, depth: number, multipv = 2): Promise<RawLine[]> {
    const run = async () => {
      await this.ready;
      this.transport.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady();
      const lines = new Map<number, RawLine>();
      const onInfo = (l: string) => {
        if (!l.startsWith('info ') || !l.includes(' pv ') || l.includes('bound')) return;
        const t = l.split(' ');
        const get = (k: string) => {
          const i = t.indexOf(k);
          return i >= 0 ? t[i + 1] : undefined;
        };
        const mpv = Number(get('multipv') ?? 1);
        const scoreIdx = t.indexOf('score');
        const kind = t[scoreIdx + 1];
        const val = Number(t[scoreIdx + 2]);
        lines.set(mpv, {
          multipv: mpv,
          depth: Number(get('depth')),
          cp: kind === 'cp' ? val : null,
          mate: kind === 'mate' ? val : null,
          pv: t.slice(t.indexOf('pv') + 1),
        });
      };
      this.listeners.add(onInfo);
      const done = this.waitFor((l) => l.startsWith('bestmove'));
      this.transport.send(`position fen ${fen}`);
      this.transport.send(`go depth ${depth}`);
      await done;
      this.listeners.delete(onInfo);
      return [...lines.values()].sort((a, b) => a.multipv - b.multipv);
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  terminate() {
    this.transport.terminate();
  }
}

export function createBrowserEngine(): Engine {
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
  return new Engine({
    send: (cmd) => worker.postMessage(cmd),
    onLine: (cb) => {
      worker.onmessage = (e: MessageEvent) => cb(String(e.data));
    },
    terminate: () => worker.terminate(),
  });
}
