import {
  getProjectBrowserSession,
  getProjectBrowserSessionRevision,
  isPreviewTabKind,
  makeWebTab,
  navigateProjectBrowserTab,
  setProjectBrowserSession,
  subscribeProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
} from "@/lib/project-browser-session";
import { normalizeBrowserUrl } from "@/lib/preview-url";
import { safeLocalStorageSetItem } from "@/lib/safe-local-storage";

export const STANDALONE_BROWSER_PROJECT_ID = "__standalone__";

const PINNED_PREFIX = "courier-standalone-browser-pinned";

export function standaloneBrowserPinnedKey(
  profileId: string,
  workspaceId: string,
) {
  return `${PINNED_PREFIX}:${profileId}:${workspaceId}`;
}

export function readStandaloneBrowserPinned(
  profileId: string,
  workspaceId: string,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(
        standaloneBrowserPinnedKey(profileId, workspaceId),
      ) === "1"
    );
  } catch {
    return false;
  }
}

export function writeStandaloneBrowserPinned(
  profileId: string,
  workspaceId: string,
  pinned: boolean,
) {
  safeLocalStorageSetItem(
    standaloneBrowserPinnedKey(profileId, workspaceId),
    pinned ? "1" : "0",
  );
}

export function standaloneBrowserKey(
  profileId: string,
  workspaceId: string,
): ProjectBrowserKey {
  return {
    profileId,
    workspaceId,
    spaceId: "work",
    projectId: STANDALONE_BROWSER_PROJECT_ID,
  };
}

export function defaultStandaloneBrowserSession(): ProjectBrowserSession {
  const web = makeWebTab("about:blank");
  return { tabs: [web], activeTabId: web.id };
}

export function getStandaloneBrowserSession(
  key: ProjectBrowserKey,
  fallback = defaultStandaloneBrowserSession(),
) {
  const session = getProjectBrowserSession(key, fallback);
  const invalid = session.tabs.some((tab) => isPreviewTabKind(tab.kind));
  if (invalid || !session.tabs.length) {
    setStandaloneBrowserSession(key, fallback);
    return fallback;
  }
  return session;
}

export function setStandaloneBrowserSession(
  key: ProjectBrowserKey,
  session: ProjectBrowserSession,
) {
  setProjectBrowserSession(key, session);
}

export function subscribeStandaloneBrowserSession(listener: () => void) {
  return subscribeProjectBrowserSession(listener);
}

export function getStandaloneBrowserSessionRevision() {
  return getProjectBrowserSessionRevision();
}

/** Open standalone browser and optionally navigate the active tab to a query/URL. */
export function primeStandaloneBrowserSession(
  key: ProjectBrowserKey,
  query?: string | null,
) {
  const trimmed = query?.trim();
  if (!trimmed) return;

  const current = getStandaloneBrowserSession(key);
  const url = normalizeBrowserUrl(trimmed);
  const active =
    current.tabs.find((tab) => tab.id === current.activeTabId) ??
    current.tabs[0];
  if (!active) return;

  setStandaloneBrowserSession(key, {
    ...current,
    tabs: current.tabs.map((tab) =>
      tab.id === active.id ? navigateProjectBrowserTab(tab, url) : tab,
    ),
  });
}
