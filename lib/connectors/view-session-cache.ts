/**
 * In-memory session cache for connector panel views.
 * Survives remount when switching connectors / collapsing the panel.
 */

export const CONNECTOR_VIEW_CACHE_TTL_MS = 10 * 60 * 1000;

type Entry<T> = {
  fetchedAt: number;
  data: T;
};

const store = new Map<string, Entry<unknown>>();

export function viewCacheKey(
  connectorId: string,
  workspaceId: string,
  scope = "default",
) {
  return `${connectorId}|${workspaceId}|${scope}`;
}

export function readViewCache<T>(
  key: string,
  ttlMs = CONNECTOR_VIEW_CACHE_TTL_MS,
): T | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > ttlMs) return null;
  return hit.data;
}

/** Return cached data even if stale (for instant paint before refresh). */
export function peekViewCache<T>(
  key: string,
): { data: T; fetchedAt: number; fresh: boolean } | null {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit) return null;
  return {
    data: hit.data,
    fetchedAt: hit.fetchedAt,
    fresh: Date.now() - hit.fetchedAt <= CONNECTOR_VIEW_CACHE_TTL_MS,
  };
}

export function writeViewCache<T>(key: string, data: T) {
  store.set(key, { fetchedAt: Date.now(), data });
}

export function invalidateViewCache(key: string) {
  store.delete(key);
}

export function invalidateConnectorViewCache(
  connectorId: string,
  workspaceId: string,
) {
  const prefix = `${connectorId}|${workspaceId}|`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix) || key === `${connectorId}|${workspaceId}|default`) {
      store.delete(key);
    }
  }
  // Also clear exact default key variants.
  store.delete(viewCacheKey(connectorId, workspaceId));
  store.delete(viewCacheKey(connectorId, workspaceId, "list"));
}

export function touchViewCache<T>(key: string, data: T, fetchedAt?: number) {
  store.set(key, {
    fetchedAt: fetchedAt ?? Date.now(),
    data,
  });
}
