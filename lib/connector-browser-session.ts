/**
 * In-memory + localStorage browser session for connector views.
 * First tab is always the pinned connector surface and cannot be closed.
 */

import { titleFromUrl } from "@/lib/preview-url";
import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

export type ConnectorBrowserTabKind = "connector" | "web";

export type ConnectorBrowserTab = {
  id: string;
  kind: ConnectorBrowserTabKind;
  title: string;
  url: string;
  faviconUrl?: string | null;
  pinned?: boolean;
  connectorId?: string;
  history: string[];
  historyIndex: number;
};

export type ConnectorBrowserSession = {
  tabs: ConnectorBrowserTab[];
  activeTabId: string;
};

type Listener = () => void;

const STORAGE_PREFIX = "cander-connector-browser";
const listeners = new Set<Listener>();
const cache = new Map<string, ConnectorBrowserSession>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function connectorBrowserStorageKey(
  profileId: string,
  workspaceId: string,
  connectorId: string,
) {
  return `${profileId}|${workspaceId}|${connectorId}`;
}

export function pinnedConnectorTabId(connectorId: string) {
  return `tab-pinned-connector-${connectorId}`;
}

export function newConnectorBrowserTabId() {
  return `tab-${Math.random().toString(36).slice(2, 8)}`;
}

export function makePinnedConnectorTab(
  connectorId: string,
  title: string,
): ConnectorBrowserTab {
  return {
    id: pinnedConnectorTabId(connectorId),
    kind: "connector",
    title,
    url: `cander://connector/${connectorId}`,
    pinned: true,
    connectorId,
    history: [`cander://connector/${connectorId}`],
    historyIndex: 0,
  };
}

export function makeConnectorWebTab(url = "about:blank", title = "New Tab") {
  return {
    id: newConnectorBrowserTabId(),
    kind: "web" as const,
    title,
    url,
    history: [url],
    historyIndex: 0,
  };
}

export function defaultConnectorBrowserSession(
  connectorId: string,
  title: string,
): ConnectorBrowserSession {
  const tab = makePinnedConnectorTab(connectorId, title);
  return { tabs: [tab], activeTabId: tab.id };
}

function sessionsEqual(
  a: ConnectorBrowserSession,
  b: ConnectorBrowserSession,
): boolean {
  if (a === b) return true;
  if (a.activeTabId !== b.activeTabId || a.tabs.length !== b.tabs.length) {
    return false;
  }
  return a.tabs.every((tab, index) => {
    const other = b.tabs[index];
    return (
      other &&
      tab.id === other.id &&
      tab.kind === other.kind &&
      tab.title === other.title &&
      tab.url === other.url &&
      Boolean(tab.pinned) === Boolean(other.pinned) &&
      tab.connectorId === other.connectorId
    );
  });
}

function ensurePinned(
  session: ConnectorBrowserSession,
  connectorId: string,
  title: string,
): ConnectorBrowserSession {
  const pinnedId = pinnedConnectorTabId(connectorId);
  const existing = session.tabs.find((tab) => tab.id === pinnedId);
  const others = session.tabs.filter((tab) => tab.id !== pinnedId);

  const pinned: ConnectorBrowserTab = existing
    ? {
        ...existing,
        pinned: true,
        kind: "connector",
        title,
        connectorId,
        url: existing.url || `cander://connector/${connectorId}`,
      }
    : makePinnedConnectorTab(connectorId, title);

  const tabs = [pinned, ...others.filter((tab) => tab.kind !== "connector")];
  const activeOk = tabs.some((tab) => tab.id === session.activeTabId);
  const next: ConnectorBrowserSession = {
    tabs,
    activeTabId: activeOk ? session.activeTabId : pinned.id,
  };
  return sessionsEqual(session, next) ? session : next;
}

function readStorage(key: string): ConnectorBrowserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConnectorBrowserSession;
    if (!parsed?.tabs?.length || !parsed.activeTabId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(key: string, session: ConnectorBrowserSession) {
  if (typeof window === "undefined") return;
  safeLocalStorageSetItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(session));
}

/**
 * Snapshot for useSyncExternalStore — must return a stable reference when
 * session contents are unchanged (otherwise React loops forever).
 */
export function getConnectorBrowserSession(
  key: string,
  connectorId: string,
  title: string,
): ConnectorBrowserSession {
  const cached = cache.get(key);
  if (cached) {
    const next = ensurePinned(cached, connectorId, title);
    if (next !== cached) {
      cache.set(key, next);
      writeStorage(key, next);
    }
    return next;
  }
  const stored = readStorage(key);
  const session = ensurePinned(
    stored ?? defaultConnectorBrowserSession(connectorId, title),
    connectorId,
    title,
  );
  cache.set(key, session);
  return session;
}

export function setConnectorBrowserSession(
  key: string,
  session: ConnectorBrowserSession,
  connectorId: string,
  title: string,
) {
  const next = ensurePinned(session, connectorId, title);
  const prev = cache.get(key);
  if (prev && sessionsEqual(prev, next)) return;
  cache.set(key, next);
  writeStorage(key, next);
  emit();
}

export function subscribeConnectorBrowserSession(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function navigateConnectorWebTab(
  tab: ConnectorBrowserTab,
  url: string,
  title?: string,
): ConnectorBrowserTab {
  const history = tab.history.slice(0, tab.historyIndex + 1);
  history.push(url);
  return {
    ...tab,
    url,
    title: title || titleFromUrl(url) || tab.title,
    history,
    historyIndex: history.length - 1,
  };
}

export function openUrlInConnectorBrowserSession(
  session: ConnectorBrowserSession,
  rawUrl: string,
  title?: string,
): ConnectorBrowserSession {
  const url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) return session;
  const existing = session.tabs.find(
    (tab) => tab.kind === "web" && tab.url === url,
  );
  if (existing) {
    if (session.activeTabId === existing.id) return session;
    return { ...session, activeTabId: existing.id };
  }
  const tab = navigateConnectorWebTab(makeConnectorWebTab(url), url, title);
  return {
    tabs: [...session.tabs, tab],
    activeTabId: tab.id,
  };
}
