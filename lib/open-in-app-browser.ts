/**
 * Open an http(s) URL in Cander's in-app browser (project tab or right-panel).
 * Does not navigate away from the app.
 */

import { isHttpUrl, normalizeBrowserUrl } from "@/lib/preview-url";
import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  makeWebTab,
  navigateProjectBrowserTab,
  setProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
} from "@/lib/project-browser-session";
import {
  getStandaloneBrowserSession,
  setStandaloneBrowserSession,
  standaloneBrowserKey,
} from "@/lib/standalone-browser-session";
import type { SpaceId } from "@/lib/types";
import {
  defaultWorkItemBrowserSession,
  findWorkCollectionItem,
} from "@/lib/work-item-browser";

export function isSafeInAppBrowserUrl(url: string): boolean {
  return isHttpUrl(url);
}

export function sameBrowserUrl(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = "";
    right.hash = "";
    const norm = (u: URL) =>
      `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "") || "/"}${u.search}`.toLowerCase();
    return norm(left) === norm(right);
  } catch {
    return a === b;
  }
}

/** Focus an existing tab or navigate a blank tab / add a new web tab. */
export function nextBrowserSessionForUrl(
  session: ProjectBrowserSession,
  rawUrl: string,
  title?: string,
): ProjectBrowserSession | null {
  const url = normalizeBrowserUrl(rawUrl);
  if (!url || url === "about:blank" || !isHttpUrl(url)) return null;

  const existing = session.tabs.find(
    (tab) => tab.kind === "web" && sameBrowserUrl(tab.url, url),
  );
  if (existing) {
    return { ...session, activeTabId: existing.id };
  }

  const blank =
    session.tabs.length === 1 &&
    session.tabs[0] &&
    session.tabs[0].kind === "web" &&
    (!session.tabs[0].url || session.tabs[0].url === "about:blank");
  if (blank && session.tabs[0]) {
    const next = navigateProjectBrowserTab(session.tabs[0], url, title);
    return { tabs: [next], activeTabId: next.id };
  }

  const tab = navigateProjectBrowserTab(makeWebTab(), url, title);
  return {
    tabs: [...session.tabs, tab],
    activeTabId: tab.id,
  };
}

export function openUrlInProjectBrowser(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  projectTitle: string;
  url: string;
  title?: string;
}): boolean {
  if (!opts.projectId || opts.spaceId === "connectors") return false;
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };
  const workItem = findWorkCollectionItem(opts.projectId);
  const fallback = workItem
    ? defaultWorkItemBrowserSession(workItem)
    : defaultProjectBrowserSession({
        projectId: opts.projectId,
        title: opts.projectTitle,
        spaceId: opts.spaceId,
      });
  const current = getProjectBrowserSession(key, fallback);
  const next = nextBrowserSessionForUrl(current, opts.url, opts.title);
  if (!next) return false;
  setProjectBrowserSession(key, next);
  return true;
}

export function openUrlInStandaloneBrowser(opts: {
  profileId: string;
  workspaceId: string;
  url: string;
  title?: string;
}): boolean {
  const key = standaloneBrowserKey(opts.profileId, opts.workspaceId);
  const current = getStandaloneBrowserSession(key);
  const next = nextBrowserSessionForUrl(current, opts.url, opts.title);
  if (!next) return false;
  setStandaloneBrowserSession(key, next);
  return true;
}
