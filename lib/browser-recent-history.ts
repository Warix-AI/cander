/**
 * Global recent browser visits for blank-tab + address-bar suggestions.
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

let cache: BrowserRecentVisit[] | null = null;

function emit() {
  LISTENERS.forEach((listener) => listener());
}

function read(): BrowserRecentVisit[] {
  if (cache) return cache;
  if (typeof window === "undefined") {
    cache = [];
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) {
      cache = [];
      return cache;
    }
    cache = parsed
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
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: BrowserRecentVisit[]) {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
  return [];
}

/** Most recent unique visits (default 5 for blank tab). */
export function listRecentBrowserVisits(limit = 5): BrowserRecentVisit[] {
  return read().slice(0, Math.max(0, limit));
}

export function filterRecentBrowserVisits(
  query: string,
  limit = 8,
): BrowserRecentVisit[] {
  const q = query.trim().toLowerCase();
  const all = read();
  if (!q) return all.slice(0, limit);
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
  const next = [
    { url, title, visitedAt: now },
    ...read().filter((item) => item.url !== url),
  ].slice(0, MAX_RECENTS);
  write(next);
}
