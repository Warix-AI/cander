import {
  isGoogleUrl,
  previewUrlForProject,
  titleFromUrl,
} from "@/lib/preview-url";
import type { SpaceId } from "@/lib/types";

export type ProjectBrowserTabKind = "project" | "url";

export type ProjectBrowserTab = {
  id: string;
  kind: ProjectBrowserTabKind;
  title: string;
  url: string;
  pinned?: boolean;
  projectId?: string;
  history: string[];
  historyIndex: number;
};

export type ProjectBrowserSession = {
  tabs: ProjectBrowserTab[];
  activeTabId: string;
};

export type ProjectBrowserKey = {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
};

type Listener = () => void;

const STORAGE_PREFIX = "courier-project-browser";
const listeners = new Set<Listener>();
const cache = new Map<string, ProjectBrowserSession>();
const hydratedKeys = new Set<string>();
let revision = 0;
let lastChangedKey = "";

function emit() {
  listeners.forEach((listener) => listener());
}

export function projectBrowserStorageKey(key: ProjectBrowserKey) {
  return `${key.profileId}|${key.workspaceId}|${key.spaceId}|${key.projectId}`;
}

export function parseProjectBrowserStorageKey(
  raw: string,
): ProjectBrowserKey | null {
  const parts = raw.split("|");
  if (parts.length !== 4) return null;
  const [profileId, workspaceId, spaceId, projectId] = parts;
  if (!profileId || !workspaceId || !spaceId || !projectId) return null;
  if (spaceId !== "work" && spaceId !== "build" && spaceId !== "research") {
    return null;
  }
  return { profileId, workspaceId, spaceId, projectId };
}

export function pinnedProjectTabId(projectId: string) {
  return `tab-pinned-${projectId}`;
}

export function newBrowserTabId() {
  return `tab-${Math.random().toString(36).slice(2, 8)}`;
}

function withHistory(url: string, prior?: string[]): Pick<
  ProjectBrowserTab,
  "history" | "historyIndex"
> {
  const history = prior && prior.length ? prior : [url];
  return { history, historyIndex: history.length - 1 };
}

export function makePinnedProjectTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return {
    id: pinnedProjectTabId(input.projectId),
    kind: "project",
    title: input.title,
    url: input.url,
    pinned: true,
    projectId: input.projectId,
    ...withHistory(input.url),
  };
}

export function makeUrlTab(url = "https://www.google.com"): ProjectBrowserTab {
  return {
    id: newBrowserTabId(),
    kind: "url",
    title: isGoogleUrl(url) ? "Google" : titleFromUrl(url),
    url,
    ...withHistory(url),
  };
}

export function makeProjectTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return {
    id: `tab-project-${input.projectId}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "project",
    title: input.title,
    url: input.url,
    projectId: input.projectId,
    ...withHistory(input.url),
  };
}

export function defaultProjectBrowserSession(input: {
  projectId: string;
  title: string;
  publishedUrl?: string | null;
}): ProjectBrowserSession {
  const url = previewUrlForProject(input.projectId, input.publishedUrl);
  const pinned = makePinnedProjectTab({
    projectId: input.projectId,
    title: input.title,
    url,
  });
  return { tabs: [pinned], activeTabId: pinned.id };
}

function parseTab(raw: unknown): ProjectBrowserTab | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<ProjectBrowserTab>;
  if (!data.id || !data.title) return null;
  const kind: ProjectBrowserTabKind =
    data.kind === "project" || data.kind === "url" ? data.kind : "url";
  const url = String(data.url ?? "");
  const history = Array.isArray(data.history)
    ? data.history.map((item) => String(item)).filter(Boolean)
    : url
      ? [url]
      : [""];
  const historyIndex =
    typeof data.historyIndex === "number" &&
    data.historyIndex >= 0 &&
    data.historyIndex < history.length
      ? data.historyIndex
      : Math.max(0, history.length - 1);
  return {
    id: String(data.id),
    kind,
    title: String(data.title),
    url: history[historyIndex] ?? url,
    pinned: Boolean(data.pinned),
    projectId: data.projectId ? String(data.projectId) : undefined,
    history: history.length ? history : [url],
    historyIndex,
  };
}

function parseSession(raw: string | null): ProjectBrowserSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ProjectBrowserSession>;
    return coerceProjectBrowserSession(data);
  } catch {
    return null;
  }
}

export function coerceProjectBrowserSession(
  data: Partial<ProjectBrowserSession> | null | undefined,
): ProjectBrowserSession | null {
  if (!data) return null;
  const tabs = Array.isArray(data.tabs)
    ? data.tabs.map(parseTab).filter((tab): tab is ProjectBrowserTab => Boolean(tab))
    : [];
  if (!tabs.length) return null;
  const activeTabId =
    typeof data.activeTabId === "string" &&
    tabs.some((tab) => tab.id === data.activeTabId)
      ? data.activeTabId
      : tabs[0].id;
  return { tabs, activeTabId };
}

function persistKey(key: string, session: ProjectBrowserSession) {
  cache.set(key, session);
  lastChangedKey = key;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(session));
  }
  revision += 1;
  emit();
}

function hydrateKey(key: ProjectBrowserKey, fallback: ProjectBrowserSession) {
  const storageKey = projectBrowserStorageKey(key);
  if (hydratedKeys.has(storageKey) && cache.has(storageKey)) {
    return cache.get(storageKey)!;
  }
  hydratedKeys.add(storageKey);
  if (typeof window === "undefined") {
    cache.set(storageKey, fallback);
    return fallback;
  }
  const stored = parseSession(
    window.localStorage.getItem(`${STORAGE_PREFIX}:${storageKey}`),
  );
  const session = stored
    ? ensurePinnedTab(stored, fallback.tabs[0])
    : fallback;
  cache.set(storageKey, session);
  return session;
}

export function ensurePinnedTab(
  session: ProjectBrowserSession,
  pinned: ProjectBrowserTab,
): ProjectBrowserSession {
  const existing = session.tabs.find((tab) => tab.pinned || tab.id === pinned.id);
  if (existing) {
    const tabs = session.tabs.map((tab) =>
      tab.id === existing.id
        ? {
            ...tab,
            pinned: true,
            kind: "project" as const,
            projectId: pinned.projectId,
            title: tab.title || pinned.title,
            url: tab.url || pinned.url,
          }
        : tab,
    );
    const activeTabId = tabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : pinned.id;
    return { tabs, activeTabId };
  }
  return {
    tabs: [pinned, ...session.tabs],
    activeTabId: session.activeTabId || pinned.id,
  };
}

export function subscribeProjectBrowserSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getProjectBrowserSessionRevision() {
  return revision;
}

export function getLastChangedProjectBrowserKey() {
  return lastChangedKey;
}

export function getProjectBrowserSession(
  key: ProjectBrowserKey,
  fallback: ProjectBrowserSession,
) {
  return hydrateKey(key, fallback);
}

export function setProjectBrowserSession(
  key: ProjectBrowserKey,
  session: ProjectBrowserSession,
) {
  persistKey(projectBrowserStorageKey(key), session);
}

export function replaceProjectBrowserSession(
  key: ProjectBrowserKey,
  session: ProjectBrowserSession | null,
  fallback: ProjectBrowserSession,
) {
  const storageKey = projectBrowserStorageKey(key);
  hydratedKeys.add(storageKey);
  const next = session ? ensurePinnedTab(session, fallback.tabs[0]) : fallback;
  persistKey(storageKey, next);
}

export function replaceProjectBrowserWorkspaceState(
  profileId: string,
  workspaceId: string,
  sessions: { key: ProjectBrowserKey; session: ProjectBrowserSession }[],
) {
  const prefix = `${profileId}|${workspaceId}|`;
  for (const existing of [...cache.keys()]) {
    if (existing.startsWith(prefix)) {
      cache.delete(existing);
      hydratedKeys.delete(existing);
    }
  }
  for (const item of sessions) {
    const storageKey = projectBrowserStorageKey(item.key);
    hydratedKeys.add(storageKey);
    cache.set(storageKey, item.session);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}:${storageKey}`,
        JSON.stringify(item.session),
      );
    }
  }
  lastChangedKey = "";
  revision += 1;
  emit();
}

export function listCachedProjectBrowserSessions(
  profileId: string,
  workspaceId: string,
) {
  const prefix = `${profileId}|${workspaceId}|`;
  const items: { key: ProjectBrowserKey; session: ProjectBrowserSession }[] = [];
  for (const [storageKey, session] of cache) {
    if (!storageKey.startsWith(prefix)) continue;
    const parsed = parseProjectBrowserStorageKey(storageKey);
    if (!parsed) continue;
    items.push({ key: parsed, session });
  }
  return items;
}

export function updateProjectBrowserTab(
  session: ProjectBrowserSession,
  tabId: string,
  patch: Partial<ProjectBrowserTab>,
): ProjectBrowserSession {
  return {
    ...session,
    tabs: session.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, ...patch } : tab,
    ),
  };
}

export function navigateProjectBrowserTab(
  tab: ProjectBrowserTab,
  url: string,
  title?: string,
): ProjectBrowserTab {
  const nextHistory = tab.history.slice(0, tab.historyIndex + 1);
  if (nextHistory[nextHistory.length - 1] !== url) {
    nextHistory.push(url);
  }
  return {
    ...tab,
    url,
    title: title ?? (isGoogleUrl(url) ? "Google" : titleFromUrl(url)),
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
}

export function stepProjectBrowserTab(
  tab: ProjectBrowserTab,
  delta: -1 | 1,
): ProjectBrowserTab {
  const nextIndex = tab.historyIndex + delta;
  if (nextIndex < 0 || nextIndex >= tab.history.length) return tab;
  const url = tab.history[nextIndex];
  return {
    ...tab,
    url,
    title: isGoogleUrl(url) ? "Google" : titleFromUrl(url) || tab.title,
    historyIndex: nextIndex,
  };
}
