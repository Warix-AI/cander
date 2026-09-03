import {
  isGoogleUrl,
  previewUrlForProject,
  titleFromUrl,
} from "@/lib/preview-url";
import type { SpaceId } from "@/lib/types";
import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

/**
 * Intent-based tab kinds. Do not conflate ordinary browsing with sandboxes.
 * - build-preview: current project's sandbox/dev preview
 * - project-preview: another Cander project's preview
 * - web: user-controlled platform browser surface
 * - agent-browser: Vercel/hosted computer stream for agent visual work
 */
export type ProjectBrowserTabKind =
  | "build-preview"
  | "project-preview"
  | "web"
  | "agent-browser"
  | "studio-image"
  | "studio-video"
  | "studio-document";

export type ProjectBrowserTab = {
  id: string;
  kind: ProjectBrowserTabKind;
  title: string;
  url: string;
  faviconUrl?: string | null;
  pinned?: boolean;
  projectId?: string;
  /** Durable computer_sessions id for agent-browser or build sandbox metadata. */
  computerSessionId?: string;
  /** Studio image tab bound to a chat image_generation job. */
  boundGenerationId?: string;
  /** Locked canvas aspect (e.g. "3:4") after resize — survives remounts. */
  aspectRatio?: string | null;
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
/** Last local write time per storage key — avoids stale remote hydrates clobbering tabs. */
const localWriteAt = new Map<string, number>();
/** When true, session updates stay in memory (quick-search browsing). */
let volatilePersistence = false;

export function setProjectBrowserVolatilePersistence(volatile: boolean) {
  volatilePersistence = volatile;
}

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
  if (spaceId !== "work" && spaceId !== "build" && spaceId !== "research" && spaceId !== "studio") {
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

/** Migrate legacy `project` / `url` kinds from saved state. */
export function normalizeTabKind(
  raw: string | undefined,
  opts?: { pinned?: boolean; spaceId?: SpaceId },
): ProjectBrowserTabKind {
  if (
    raw === "build-preview" ||
    raw === "project-preview" ||
    raw === "web" ||
    raw === "agent-browser" ||
    raw === "studio-image" ||
    raw === "studio-video" ||
    raw === "studio-document"
  ) {
    return raw;
  }
  if (raw === "project") {
    if (opts?.pinned && opts.spaceId === "build") {
      return "build-preview";
    }
    return "project-preview";
  }
  // Legacy url (and unknown) → web
  return "web";
}

export function makePinnedBuildPreviewTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return {
    id: pinnedProjectTabId(input.projectId),
    kind: "build-preview",
    title: input.title,
    url: input.url,
    pinned: true,
    projectId: input.projectId,
    ...withHistory(input.url),
  };
}

/** @deprecated Use makePinnedBuildPreviewTab or makeProjectPreviewTab */
export function makePinnedProjectTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return makePinnedBuildPreviewTab(input);
}

export function makeStudioMediaTab(
  kind: "studio-image" | "studio-video" | "studio-document",
  title?: string,
): ProjectBrowserTab {
  const labels = {
    "studio-image": "Image",
    "studio-video": "Video",
    "studio-document": "Document",
  } as const;
  return {
    id: newBrowserTabId(),
    kind,
    title: title ?? labels[kind],
    url: "",
    ...withHistory(""),
  };
}

export function makeWebTab(url = "about:blank"): ProjectBrowserTab {
  return {
    id: newBrowserTabId(),
    kind: "web",
    title:
      url === "about:blank"
        ? "New tab"
        : isGoogleUrl(url)
          ? "Google"
          : titleFromUrl(url),
    url,
    ...withHistory(url),
  };
}

/** @deprecated Use makeWebTab */
export function makeUrlTab(url = "about:blank"): ProjectBrowserTab {
  return makeWebTab(url);
}

export function makeProjectPreviewTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return {
    id: `tab-project-${input.projectId}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "project-preview",
    title: input.title,
    url: input.url,
    projectId: input.projectId,
    ...withHistory(input.url),
  };
}

/** @deprecated Use makeProjectPreviewTab */
export function makeProjectTab(input: {
  projectId: string;
  title: string;
  url: string;
}): ProjectBrowserTab {
  return makeProjectPreviewTab(input);
}

export function makeAgentBrowserTab(input: {
  url: string;
  computerSessionId: string;
  title?: string;
}): ProjectBrowserTab {
  return {
    id: `tab-agent-${input.computerSessionId.slice(0, 12)}`,
    kind: "agent-browser",
    title: input.title ?? titleFromUrl(input.url) ?? "Agent browser",
    url: input.url,
    computerSessionId: input.computerSessionId,
    ...withHistory(input.url),
  };
}

export function defaultProjectBrowserSession(input: {
  projectId: string;
  title: string;
  publishedUrl?: string | null;
  spaceId?: SpaceId;
}): ProjectBrowserSession {
  const url = previewUrlForProject(input.projectId, input.publishedUrl);
  const spaceId = input.spaceId ?? "build";

  if (spaceId === "research") {
    const web = makeWebTab();
    return { tabs: [web], activeTabId: web.id };
  }

  if (spaceId === "studio") {
    const canvas = makeStudioMediaTab("studio-image", "Canvas");
    return { tabs: [canvas], activeTabId: canvas.id };
  }

  if (spaceId === "build") {
    const pinned = makePinnedBuildPreviewTab({
      projectId: input.projectId,
      title: input.title,
      url,
    });
    return { tabs: [pinned], activeTabId: pinned.id };
  }

  // Work / other: project preview of the open project
  const preview = makeProjectPreviewTab({
    projectId: input.projectId,
    title: input.title,
    url,
  });
  preview.pinned = true;
  preview.id = pinnedProjectTabId(input.projectId);
  return { tabs: [preview], activeTabId: preview.id };
}

function parseTab(
  raw: unknown,
  spaceId?: SpaceId,
): ProjectBrowserTab | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<ProjectBrowserTab> & { kind?: string };
  if (!data.id || !data.title) return null;
  const kind = normalizeTabKind(data.kind, {
    pinned: Boolean(data.pinned),
    spaceId,
  });
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
    computerSessionId: data.computerSessionId
      ? String(data.computerSessionId)
      : undefined,
    boundGenerationId: data.boundGenerationId
      ? String(data.boundGenerationId)
      : undefined,
    aspectRatio:
      typeof data.aspectRatio === "string" && data.aspectRatio.trim()
        ? data.aspectRatio.trim()
        : data.aspectRatio === null
          ? null
          : undefined,
    history: history.length ? history : [url],
    historyIndex,
  };
}

function parseSession(
  raw: string | null,
  spaceId?: SpaceId,
): ProjectBrowserSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<ProjectBrowserSession>;
    return coerceProjectBrowserSession(data, spaceId);
  } catch {
    return null;
  }
}

export function coerceProjectBrowserSession(
  data: Partial<ProjectBrowserSession> | null | undefined,
  spaceId?: SpaceId,
): ProjectBrowserSession | null {
  if (!data) return null;
  const tabs = Array.isArray(data.tabs)
    ? data.tabs
        .map((tab) => parseTab(tab, spaceId))
        .filter((tab): tab is ProjectBrowserTab => Boolean(tab))
        // Agent-browser sessions are ephemeral remote streams — never restore them.
        .filter((tab) => tab.kind !== "agent-browser")
        .map((tab) => ({
          ...tab,
          // Never persist portable platform surface ids or computer session refs.
          computerSessionId: undefined,
        }))
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
  // Strip ephemeral agent-browser tabs before writing — cookies live in platform
  // partitions keyed by user/project, never in this JSON blob.
  const durable: ProjectBrowserSession = {
    ...session,
    tabs: session.tabs
      .filter((tab) => tab.kind !== "agent-browser")
      .map((tab) => ({
        ...tab,
        computerSessionId: undefined,
      })),
  };
  if (
    !durable.tabs.some((tab) => tab.id === durable.activeTabId) &&
    durable.tabs[0]
  ) {
    durable.activeTabId = durable.tabs[0].id;
  }
  // Keep in-memory cache as the live session (including agent-browser).
  cache.set(key, session);
  lastChangedKey = key;
  localWriteAt.set(key, Date.now());
  if (!volatilePersistence && typeof window !== "undefined") {
    safeLocalStorageSetItem(
      `${STORAGE_PREFIX}:${key}`,
      JSON.stringify(durable),
    );
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
    key.spaceId,
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
            kind: pinned.kind,
            projectId: pinned.projectId ?? tab.projectId,
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

/**
 * Focus or create an agent-browser tab for the given computer session.
 * Does not replace build-preview / project-preview identity.
 */
export function focusAgentBrowserTab(
  session: ProjectBrowserSession,
  input: { url: string; computerSessionId: string; title?: string },
): ProjectBrowserSession {
  const existing = session.tabs.find(
    (tab) =>
      tab.kind === "agent-browser" &&
      tab.computerSessionId === input.computerSessionId,
  );
  if (existing) {
    const tabs = session.tabs.map((tab) =>
      tab.id === existing.id
        ? navigateProjectBrowserTab(tab, input.url, input.title)
        : tab,
    );
    return { tabs, activeTabId: existing.id };
  }
  const tab = makeAgentBrowserTab(input);
  return {
    tabs: [...session.tabs, tab],
    activeTabId: tab.id,
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

/** In-memory session only — used for ephemeral quick-search browsing. */
export function setProjectBrowserSessionVolatile(
  key: ProjectBrowserKey,
  session: ProjectBrowserSession,
) {
  const storageKey = projectBrowserStorageKey(key);
  hydratedKeys.add(storageKey);
  cache.set(storageKey, session);
  lastChangedKey = storageKey;
  localWriteAt.set(storageKey, Date.now());
  revision += 1;
  emit();
}

export function clearProjectBrowserSession(key: ProjectBrowserKey) {
  const storageKey = projectBrowserStorageKey(key);
  cache.delete(storageKey);
  hydratedKeys.delete(storageKey);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(`${STORAGE_PREFIX}:${storageKey}`);
    } catch {
      /* ignore */
    }
  }
  revision += 1;
  emit();
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

export function mergeProjectBrowserRemoteSessions(
  profileId: string,
  workspaceId: string,
  sessions: {
    key: ProjectBrowserKey;
    session: ProjectBrowserSession;
    updatedAt: string;
  }[],
) {
  for (const item of sessions) {
    const storageKey = projectBrowserStorageKey(item.key);
    const remoteUpdatedMs = Date.parse(item.updatedAt);
    const localWritten = localWriteAt.get(storageKey);
    if (
      localWritten &&
      Number.isFinite(remoteUpdatedMs) &&
      remoteUpdatedMs <= localWritten
    ) {
      continue;
    }

    let existing = cache.get(storageKey);
    if (!existing && typeof window !== "undefined") {
      existing =
        parseSession(
          window.localStorage.getItem(`${STORAGE_PREFIX}:${storageKey}`),
          item.key.spaceId,
        ) ?? undefined;
    }
    if (existing && existing.tabs.length > item.session.tabs.length) {
      hydratedKeys.add(storageKey);
      cache.set(storageKey, existing);
      continue;
    }

    hydratedKeys.add(storageKey);
    cache.set(storageKey, item.session);
    if (typeof window !== "undefined") {
      safeLocalStorageSetItem(
        `${STORAGE_PREFIX}:${storageKey}`,
        JSON.stringify(item.session),
      );
    }
  }
  revision += 1;
  emit();
}

/** @deprecated Prefer mergeProjectBrowserRemoteSessions — kept for imports. */
export function replaceProjectBrowserWorkspaceState(
  profileId: string,
  workspaceId: string,
  sessions: { key: ProjectBrowserKey; session: ProjectBrowserSession }[],
) {
  mergeProjectBrowserRemoteSessions(
    profileId,
    workspaceId,
    sessions.map((item) => ({
      ...item,
      updatedAt: new Date(0).toISOString(),
    })),
  );
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

export function isPreviewTabKind(kind: ProjectBrowserTabKind) {
  return kind === "build-preview" || kind === "project-preview";
}

export function isStudioMediaTabKind(kind: ProjectBrowserTabKind) {
  return (
    kind === "studio-image" ||
    kind === "studio-video" ||
    kind === "studio-document"
  );
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
  const nextTitle =
    title ??
    (isPreviewTabKind(tab.kind)
      ? tab.title
      : isGoogleUrl(url)
        ? "Google"
        : titleFromUrl(url));
  return {
    ...tab,
    url,
    title: nextTitle,
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
    title: isPreviewTabKind(tab.kind)
      ? tab.title
      : isGoogleUrl(url)
        ? "Google"
        : titleFromUrl(url) || tab.title,
    historyIndex: nextIndex,
  };
}
