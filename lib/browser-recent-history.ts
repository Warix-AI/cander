/**
 * Global recent browser visits for blank-tab + address-bar suggestions.
 *
 * useSyncExternalStore requires referentially stable snapshots — never return a
 * fresh [] / .slice() from getSnapshot on every call.
 */

import { displayHostFromUrl, isHttpUrl, titleFromUrl } from "@/lib/preview-url";

export type BrowserRecentVisit = {
  url: string;
  title: string;
  visitedAt: number;
};

const STORAGE_KEY = "courier-browser-recent-v1";
const MAX_RECENTS = 40;
const LISTENERS = new Set<() => void>();
const EMPTY_RECENTS: BrowserRecentVisit[] = [];

let cache: BrowserRecentVisit[] | null = null;
/** Cached listRecentBrowserVisits(limit) results — cleared on write. */
const limitedSnapshots = new Map<number, BrowserRecentVisit[]>();

function emit() {
  LISTENERS.forEach((listener) => listener());
}

function read(): BrowserRecentVisit[] {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = EMPTY_RECENTS;
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      cache = EMPTY_RECENTS;
      return cache;
    }
    const next = parsed
      .filter(
        (item): item is BrowserRecentVisit =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as BrowserRecentVisit).url === "string" &&
          typeof (item as BrowserRecentVisit).visitedAt === "number",
      )
      .map((item) => ({
        url: item.url,
        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title
            : titleFromUrl(item.url),
        visitedAt: item.visitedAt,
      }))
      .filter((item) => isHttpUrl(item.url) && item.url !== "about:blank")
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENTS);
    cache = next.length ? next : EMPTY_RECENTS;
  } catch {
    cache = EMPTY_RECENTS;
  }
  return cache;
}

function write(next: BrowserRecentVisit[]) {
  cache = next.length ? next : EMPTY_RECENTS;
  limitedSnapshots.clear();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch {
      /* ignore quota */
    }
  }
  emit();
}

export function subscribeBrowserRecentHistory(listener: () => void) {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}

export function getBrowserRecentHistorySnapshot() {
  return read();
}

export function getBrowserRecentHistoryServerSnapshot(): BrowserRecentVisit[] {
  return EMPTY_RECENTS;
}

/** Most recent unique visits (default 5 for blank tab). Stable reference per limit. */
export function listRecentBrowserVisits(limit = 5): BrowserRecentVisit[] {
  const all = read();
  const n = Math.max(0, limit);
  if (n <= 0) return EMPTY_RECENTS;
  if (n >= all.length) return all;
  let snap = limitedSnapshots.get(n);
  if (!snap) {
    snap = all.slice(0, n);
    limitedSnapshots.set(n, snap);
  }
  return snap;
}

export function filterRecentBrowserVisits(
  query: string,
  limit = 8,
): BrowserRecentVisit[] {
  const q = query.trim().toLowerCase();
  const all = read();
  if (!q) return listRecentBrowserVisits(limit);
  return all
    .filter(
      (item) =>
        item.url.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        displayHostFromUrl(item.url).toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export function recordBrowserVisit(input: {
  url: string;
  title?: string | null;
}) {
  const url = input.url.trim();
  if (!url || url === "about:blank" || !isHttpUrl(url)) return;
  const title =
    (input.title && input.title.trim()) ||
    displayHostFromUrl(url) ||
    titleFromUrl(url);
  const now = Date.now();
  const prev = read();
  if (prev[0]?.url === url && prev[0]?.title === title) {
    // Same top entry — bump timestamp without churning listeners if identical order.
    const next = [{ url, title, visitedAt: now }, ...prev.slice(1)].slice(
      0,
      MAX_RECENTS,
    );
    write(next);
    return;
  }
  const next = [
    { url, title, visitedAt: now },
    ...prev.filter((item) => item.url !== url),
  ].slice(0, MAX_RECENTS);
  write(next);
}
