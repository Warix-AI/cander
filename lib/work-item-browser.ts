import { previewUrlForProject } from "@/lib/preview-url";
import {
  getProjectBrowserSession,
  makeProjectPreviewTab,
  pinnedProjectTabId,
  setProjectBrowserSession,
  type ProjectBrowserKey,
  type ProjectBrowserSession,
} from "@/lib/project-browser-session";
import {
  WORK_COLLECTION_ITEMS,
  type WorkCollectionItem,
} from "@/lib/work-screen-data";

export const WORK_ITEM_PROJECT_PREFIX = "__work-item__";

export function workItemBrowserProjectId(item: Pick<WorkCollectionItem, "id">) {
  return `${WORK_ITEM_PROJECT_PREFIX}${item.id}`;
}

export function isWorkItemBrowserProjectId(
  projectId: string | null | undefined,
) {
  return Boolean(projectId?.startsWith(WORK_ITEM_PROJECT_PREFIX));
}

export function workItemIdFromBrowserProjectId(projectId: string) {
  return projectId.slice(WORK_ITEM_PROJECT_PREFIX.length);
}

export function findWorkCollectionItem(
  projectId: string | null | undefined,
): WorkCollectionItem | null {
  if (!isWorkItemBrowserProjectId(projectId)) return null;
  const itemId = workItemIdFromBrowserProjectId(projectId!);
  return WORK_COLLECTION_ITEMS.find((item) => item.id === itemId) ?? null;
}

export function workItemBrowserKey(
  profileId: string,
  workspaceId: string,
  item: WorkCollectionItem,
): ProjectBrowserKey {
  return {
    profileId,
    workspaceId,
    spaceId: "work",
    projectId: workItemBrowserProjectId(item),
  };
}

export function defaultWorkItemBrowserSession(
  item: WorkCollectionItem,
): ProjectBrowserSession {
  const browserProjectId = workItemBrowserProjectId(item);
  const pinnedId = pinnedProjectTabId(browserProjectId);
  const previewProjectId = item.linkedProjectId ?? browserProjectId;

  const tab = makeProjectPreviewTab({
    projectId: previewProjectId,
    title: item.title,
    url: item.linkedProjectId
      ? previewUrlForProject(item.linkedProjectId)
      : "about:blank",
  });
  tab.pinned = true;
  tab.id = pinnedId;
  return { tabs: [tab], activeTabId: tab.id };
}

/** Ensure a persisted browser session exists for this Work collection item. */
export function primeWorkItemBrowserSession(
  key: ProjectBrowserKey,
  item: WorkCollectionItem,
) {
  const fallback = defaultWorkItemBrowserSession(item);
  const existing = getProjectBrowserSession(key, fallback);
  if (!existing.tabs.length) {
    setProjectBrowserSession(key, fallback);
  }
}
