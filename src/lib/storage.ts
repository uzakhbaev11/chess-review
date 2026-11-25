import type { GameAnalysis } from './types.ts';

const INDEX_KEY = 'review:index';
const MAX_SAVED = 20;

export interface SavedMeta {
  id: string;
  white: string;
  black: string;
  result: string;
  createdAt: number;
  opening?: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно или переполнено — не критично */
  }
}

export function listSaved(): SavedMeta[] {
  try {
    return JSON.parse(safeGet(INDEX_KEY) ?? '[]') as SavedMeta[];
  } catch {
    return [];
  }
}

export function loadSaved(id: string): GameAnalysis | null {
  try {
    const raw = safeGet(`review:${id}`);
    return raw ? (JSON.parse(raw) as GameAnalysis) : null;
  } catch {
    return null;
  }
}

export function saveAnalysis(a: GameAnalysis) {
  safeSet(`review:${a.id}`, JSON.stringify(a));
  const meta: SavedMeta = {
    id: a.id,
    white: a.white.name,
    black: a.black.name,
    result: a.result,
    createdAt: a.createdAt,
    opening: a.opening,
  };
  const list = [meta, ...listSaved().filter((m) => m.id !== a.id)];
  for (const old of list.slice(MAX_SAVED)) {
    try {
      localStorage.removeItem(`review:${old.id}`);
    } catch {
      /* ignore */
    }
  }
  safeSet(INDEX_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
}

export function removeSaved(id: string) {
  try {
    localStorage.removeItem(`review:${id}`);
  } catch {
    /* ignore */
  }
  safeSet(INDEX_KEY, JSON.stringify(listSaved().filter((m) => m.id !== id)));
}

export function getPref(key: string, fallback: string): string {
  return safeGet(`pref:${key}`) ?? fallback;
}
export function setPref(key: string, value: string) {
  safeSet(`pref:${key}`, value);
}
