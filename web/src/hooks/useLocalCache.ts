import { useSyncExternalStore } from 'react';
import { getCached, subscribeCached, type CachedItem } from '@/lib/localCache';

export function useLocalCache(scope: string, projectId: string | undefined): CachedItem[] {
  return useSyncExternalStore(
    (cb) => (projectId ? subscribeCached(scope, projectId, cb) : () => undefined),
    () => (projectId ? getCached(scope, projectId) : []),
    () => [],
  );
}
