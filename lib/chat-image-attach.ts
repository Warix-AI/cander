import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  makeUrlTab,
  navigateProjectBrowserTab,
  setProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import type { SpaceId } from "@/lib/types";

/** Open an attached image as a URL tab in the project browser. */
export function openProjectImageTab(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  projectTitle: string;
  imageUrl: string;
  imageName: string;
}) {
  if (!opts.imageUrl || !opts.projectId) return;
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };
  const fallback = defaultProjectBrowserSession({
    projectId: opts.projectId,
    title: opts.projectTitle,
  });
  const session = getProjectBrowserSession(key, fallback);
  const tab = navigateProjectBrowserTab(
    makeUrlTab(opts.imageUrl),
    opts.imageUrl,
  );
  tab.title = opts.imageName || "Image";
  setProjectBrowserSession(key, {
    tabs: [...session.tabs, tab],
    activeTabId: tab.id,
  });
}
