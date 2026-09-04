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
/** Cached listRecentBrowserSites(limit) results — cleared on write. */
const siteSnapshots = new Map<number, BrowserRecentVisit[]>();

function emit() {
  LISTENERS.forEach((listener) => listener());
}

function hostKey(url: string): string {
  const host = displayHostFromUrl(url).toLowerCase();
  return host || url.toLowerCase();
}

/** One entry per website host — keeps the newest path for that host. */
function uniqueByHost(items: BrowserRecentVisit[]): BrowserRecentVisit[] {
  const seen = new Set<string>();
  const out: BrowserRecentVisit[] = [];
  for (const item of items) {
    const key = hostKey(item.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      // Prefer the host as the display title for site lists.
      title: displayHostFromUrl(item.url) || item.title,
    });
  }
  return out;
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
  siteSnapshots.clear();
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

/**
 * Recent websites for the new-tab page — one row per host.
 * Stable reference per limit.
 */
export function listRecentBrowserSites(limit = 5): BrowserRecentVisit[] {
  const n = Math.max(0, limit);
  if (n <= 0) return EMPTY_RECENTS;
  let snap = siteSnapshots.get(n);
  if (!snap) {
    const sites = uniqueByHost(read()).slice(0, n);
    snap = sites.length ? sites : EMPTY_RECENTS;
    siteSnapshots.set(n, snap);
  }
  return snap;
}

/** @deprecated Prefer listRecentBrowserSites for new-tab UI. */
export function listRecentBrowserVisits(limit = 5): BrowserRecentVisit[] {
  return listRecentBrowserSites(limit);
}

/**
 * Address-bar suggestions — only when the user has typed a query.
 * Deduped by host; matched against host / title / url.
 */
export function filterRecentBrowserVisits(
  query: string,
  limit = 8,
): BrowserRecentVisit[] {
  const q = query.trim().toLowerCase();
  if (!q) return EMPTY_RECENTS;
  const matched = uniqueByHost(read()).filter((item) => {
    const host = displayHostFromUrl(item.url).toLowerCase();
    return (
      host.includes(q) ||
      item.url.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q)
    );
  });
  return matched.slice(0, limit);
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
  const key = hostKey(url);
  // Keep at most one entry per host — newest visit wins.
  const withoutHost = prev.filter((item) => hostKey(item.url) !== key);
  if (
    prev[0] &&
    hostKey(prev[0].url) === key &&
    prev[0].url === url &&
    prev[0].title === title
  ) {
    write([{ url, title, visitedAt: now }, ...withoutHost].slice(0, MAX_RECENTS));
    return;
  }
  write([{ url, title, visitedAt: now }, ...withoutHost].slice(0, MAX_RECENTS));
}
