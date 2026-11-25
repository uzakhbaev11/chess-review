import { getSettings } from './settings.ts';

// Звуки синтезируются в браузере (без файлов): модальный синтез деревянного стука —
// несколько затухающих синусоид с «деревянными» соотношениями частот, короткий щелчок
// касания и низкий отзвук доски. Буферы считаются один раз и переиспользуются.

let ctx: AudioContext | null = null;
const cache = new Map<string, AudioBuffer>();

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface KnockParams {
  /** Основная частота «тела» фигуры, Гц. */
  freq: number;
  /** Время затухания основной моды, с. */
  decay: number;
  /** Громкость щелчка касания (0–1). */
  click: number;
  /** Громкость низкого отзвука доски (0–1). */
  thump: number;
  gain: number;
}

/** Добавляет в data один деревянный стук, начиная с offset секунд. */
export function addKnock(data: Float32Array, rate: number, offset: number, p: KnockParams, seed: number) {
  // Соотношения мод для деревянного бруска (неравномерные — поэтому звук «деревянный», а не музыкальный)
  const modes = [
    { r: 1, a: 1, d: 1 },
    { r: 2.32, a: 0.45, d: 0.55 },
    { r: 4.25, a: 0.22, d: 0.35 },
    { r: 6.63, a: 0.1, d: 0.22 },
  ];
  let rnd = seed;
  const noise = () => {
    rnd = (rnd * 16807) % 2147483647;
    return (rnd / 2147483647) * 2 - 1;
  };
  const start = Math.floor(offset * rate);
  const len = Math.min(data.length - start, Math.floor(rate * 0.25));
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    // Мягкая атака ~1 мс убирает цифровой «клик»
    const attack = Math.min(1, t / 0.0012);
    let v = 0;
    for (const m of modes) v += m.a * Math.sin(2 * Math.PI * p.freq * m.r * t) * Math.exp(-t / (p.decay * m.d));
    // Низкий отзвук доски
    v += p.thump * Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t / 0.03);
    // Щелчок касания: короткий шум, слегка сглаженный
    const n = noise();
    lp += (n - lp) * 0.55;
    v += p.click * lp * Math.exp(-t / 0.004);
    data[start + i] += v * attack * p.gain;
  }
}

function buildBuffer(kind: SoundKind): AudioBuffer | null {
  const a = audio();
  if (!a) return null;
  const rate = a.sampleRate;
  const buf = a.createBuffer(1, Math.floor(rate * 0.5), rate);
  const d = buf.getChannelData(0);
  const move: KnockParams = { freq: 520, decay: 0.032, click: 0.5, thump: 0.55, gain: 0.32 };
  const capture: KnockParams = { freq: 700, decay: 0.026, click: 0.9, thump: 0.7, gain: 0.38 };
  switch (kind) {
    case 'move':
      addKnock(d, rate, 0, move, 7);
      break;
    case 'capture':
      // Резкий удар + отзвук снятой фигуры
      addKnock(d, rate, 0, capture, 11);
      addKnock(d, rate, 0.045, { ...move, freq: 460, gain: 0.14, click: 0.3 }, 13);
      break;
    case 'castle':
      addKnock(d, rate, 0, move, 17);
      addKnock(d, rate, 0.11, { ...move, freq: 480 }, 19);
      break;
    case 'check':
      addKnock(d, rate, 0, { ...capture, freq: 780, decay: 0.03 }, 23);
      break;
    case 'mate':
      addKnock(d, rate, 0, { ...capture, freq: 640, decay: 0.05, gain: 0.42 }, 29);
      break;
    case 'success':
      addKnock(d, rate, 0, { ...move, freq: 880, decay: 0.05, click: 0.1 }, 31);
      addKnock(d, rate, 0.09, { ...move, freq: 1175, decay: 0.07, click: 0.1 }, 37);
      break;
    case 'error':
      addKnock(d, rate, 0, { ...move, freq: 300, decay: 0.06, click: 0.2 }, 41);
      break;
  }
  return buf;
}

export type SoundKind = 'move' | 'capture' | 'check' | 'mate' | 'castle' | 'success' | 'error';

export function playSound(kind: SoundKind) {
  if (!getSettings().sound) return;
  const a = audio();
  if (!a) return;
  let buf = cache.get(kind);
  if (!buf) {
    const b = buildBuffer(kind);
    if (!b) return;
    cache.set(kind, b);
    buf = b;
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  // Лёгкий разброс высоты — стук не звучит одинаково каждый раз
  src.playbackRate.value = 0.97 + Math.random() * 0.06;
  src.connect(a.destination);
  src.start();
}

export function soundForSan(san: string): SoundKind {
  if (san.includes('#')) return 'mate';
  if (san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}
