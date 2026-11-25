import { useSyncExternalStore } from 'react';

export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray';

export interface Settings {
  /** Ключ Anthropic API — хранится только в этом браузере. */
  apiKey: string;
  model: string;
  aiEnabled: boolean;
  sound: boolean;
  boardTheme: BoardTheme;
  depth: number;
  /** Ваши ники через запятую — для статистики и ориентации доски. */
  myNames: string;
}

export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 — лучшее качество' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — быстрее и дешевле' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — самый дешёвый' },
];

export const BOARD_THEMES: Record<BoardTheme, { label: string; light: string; dark: string }> = {
  green: { label: 'Зелёная', light: '#ebecd0', dark: '#739552' },
  brown: { label: 'Дерево', light: '#f0d9b5', dark: '#b58863' },
  blue: { label: 'Синяя', light: '#dee3e6', dark: '#8ca2ad' },
  gray: { label: 'Серая', light: '#e0e0e0', dark: '#8a8a8a' },
};

const KEY = 'settings:v1';
const DEFAULTS: Settings = {
  apiKey: '',
  model: 'claude-opus-5-5',
  aiEnabled: true,
  sound: true,
  boardTheme: 'green',
  depth: 15,
  myNames: '',
};

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* хранилище недоступно */
  }
  return { ...DEFAULTS };
}

let current = read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* не критично */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Добавляет ник в список «моих», если его там ещё нет. */
export function rememberMyName(name: string) {
  const n = name.trim();
  if (!n) return;
  const names = myNameList();
  if (!names.includes(n.toLowerCase())) {
    updateSettings({ myNames: [...current.myNames.split(','), n].map((s) => s.trim()).filter(Boolean).join(', ') });
  }
}

export function myNameList(): string[] {
  return current.myNames
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAiReady(s: Settings = current): boolean {
  return s.aiEnabled && s.apiKey.trim().length > 0;
}
