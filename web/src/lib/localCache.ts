/**
 * Lightweight per-project cache for resource IDs that the backend doesn't list.
 * Items are stored in localStorage so the UI can show "recently seen" entries.
 * The cache survives browser sessions but is purely client-side; nothing here
 * is authoritative — it just helps users navigate.
 */

const PREFIX = 'nanas.cache.v1';

export interface CachedItem {
  id: string;
  name?: string;
  /** Free-form metadata (type, runtime, version etc.). */
  meta?: Record<string, unknown>;
  ts: number;
}

function key(scope: string, projectId: string): string {
  return `${PREFIX}.${scope}.${projectId}`;
}

export function getCached(scope: string, projectId: string): CachedItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key(scope, projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CachedItem[];
  } catch {
    return [];
  }
}

export function addCached(scope: string, projectId: string, item: Omit<CachedItem, 'ts'>): CachedItem[] {
  const list = getCached(scope, projectId).filter((i) => i.id !== item.id);
  const next: CachedItem = { ...item, ts: Date.now() };
  list.unshift(next);
  const trimmed = list.slice(0, 100);
  localStorage.setItem(key(scope, projectId), JSON.stringify(trimmed));
  notify(scope, projectId);
  return trimmed;
}

export function removeCached(scope: string, projectId: string, id: string): CachedItem[] {
  const list = getCached(scope, projectId).filter((i) => i.id !== id);
  localStorage.setItem(key(scope, projectId), JSON.stringify(list));
  notify(scope, projectId);
  return list;
}

const listeners = new Map<string, Set<() => void>>();

function notify(scope: string, projectId: string) {
  const k = key(scope, projectId);
  listeners.get(k)?.forEach((cb) => cb());
}

export function subscribeCached(
  scope: string,
  projectId: string,
  cb: () => void,
): () => void {
  const k = key(scope, projectId);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(cb);
  return () => listeners.get(k)?.delete(cb);
}
