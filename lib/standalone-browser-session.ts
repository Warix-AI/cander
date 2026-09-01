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

export const STANDALONE_BROWSER_PROJECT_ID = "__standalone__";

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
