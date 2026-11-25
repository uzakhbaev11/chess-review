import { getSettings } from './settings.ts';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Короткий «стук» дерева: шум через полосовой фильтр. */
function knock(freq: number, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * 0.08);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.4;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t);
}

function tone(freq: number, dur: number, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.frequency.value = freq;
  osc.type = 'triangle';
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export type SoundKind = 'move' | 'capture' | 'check' | 'mate' | 'castle' | 'success' | 'error';

export function playSound(kind: SoundKind) {
  if (!getSettings().sound) return;
  switch (kind) {
    case 'move':
      knock(1800, 1.6);
      break;
    case 'capture':
      knock(900, 2.2);
      knock(1500, 1.2, 0.04);
      break;
    case 'castle':
      knock(1800, 1.4);
      knock(1700, 1.4, 0.09);
      break;
    case 'check':
      knock(1600, 1.6);
      tone(880, 0.18, 0.12, 0.02);
      break;
    case 'mate':
      knock(1200, 2);
      tone(660, 0.25, 0.14, 0.03);
      tone(990, 0.4, 0.12, 0.2);
      break;
    case 'success':
      tone(660, 0.15, 0.12);
      tone(880, 0.25, 0.12, 0.12);
      break;
    case 'error':
      tone(220, 0.25, 0.12);
      break;
  }
}

export function soundForSan(san: string): SoundKind {
  if (san.includes('#')) return 'mate';
  if (san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}
