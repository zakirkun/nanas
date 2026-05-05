/**
 * Lightweight per-project cache for resource IDs that the backend doesn't list.
 * Items are stored in localStorage so the UI can show "recently seen" entries.
 * The cache survives browser sessions but is purely client-side; nothing here
 * is authoritative — it just helps users navigate.
 *
 * Snapshots returned by getCached are referentially stable while localStorage text
 * is unchanged — required for useSyncExternalStore (see useLocalCache).
 */

const PREFIX = 'nanas.cache.v1';

/** Stable empty list for missing / invalid cache entries. */
const EMPTY_LIST: CachedItem[] = [];

const snapshotByStorageKey = new Map<string, { raw: string | null; items: CachedItem[] }>();

export interface CachedItem {
  id: string;
  name?: string;
  /** Free-form metadata (type, runtime, version etc.). */
  meta?: Record<string, unknown>;
  ts: number;
}

function storageKey(scope: string, projectId: string): string {
  return `${PREFIX}.${scope}.${projectId}`;
}

export function getCached(scope: string, projectId: string): CachedItem[] {
  if (typeof localStorage === 'undefined') return EMPTY_LIST;
  const k = storageKey(scope, projectId);
  let raw: string | null;
  try {
    raw = localStorage.getItem(k);
  } catch {
    return EMPTY_LIST;
  }

  const hit = snapshotByStorageKey.get(k);
  if (hit && hit.raw === raw) {
    return hit.items;
  }

  if (raw === null || raw === '') {
    snapshotByStorageKey.set(k, { raw, items: EMPTY_LIST });
    return EMPTY_LIST;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      snapshotByStorageKey.set(k, { raw, items: EMPTY_LIST });
      return EMPTY_LIST;
    }
    const items = parsed as CachedItem[];
    snapshotByStorageKey.set(k, { raw, items });
    return items;
  } catch {
    snapshotByStorageKey.set(k, { raw, items: EMPTY_LIST });
    return EMPTY_LIST;
  }
}

export function addCached(scope: string, projectId: string, item: Omit<CachedItem, 'ts'>): CachedItem[] {
  const k = storageKey(scope, projectId);
  const list = getCached(scope, projectId).filter((i) => i.id !== item.id);
  const next: CachedItem = { ...item, ts: Date.now() };
  list.unshift(next);
  const trimmed = list.slice(0, 100);
  snapshotByStorageKey.delete(k);
  localStorage.setItem(k, JSON.stringify(trimmed));
  notify(scope, projectId);
  return trimmed;
}

export function removeCached(scope: string, projectId: string, id: string): CachedItem[] {
  const k = storageKey(scope, projectId);
  const list = getCached(scope, projectId).filter((i) => i.id !== id);
  snapshotByStorageKey.delete(k);
  localStorage.setItem(k, JSON.stringify(list));
  notify(scope, projectId);
  return list;
}

const listeners = new Map<string, Set<() => void>>();

function notify(scope: string, projectId: string) {
  const k = storageKey(scope, projectId);
  listeners.get(k)?.forEach((cb) => cb());
}

export function subscribeCached(scope: string, projectId: string, cb: () => void): () => void {
  const k = storageKey(scope, projectId);
  if (!listeners.has(k)) listeners.set(k, new Set());
  listeners.get(k)!.add(cb);
  return () => listeners.get(k)?.delete(cb);
}
