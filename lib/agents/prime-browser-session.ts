/**
 * Prime the project browser session for automation (Agent) projects.
 */

import {
  defaultProjectBrowserSession,
  setProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import type { SpaceId } from "@/lib/types";

export function primeAutomationBrowserSession(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  title: string;
  publishedUrl?: string | null;
  agentSurface: "builder" | "overview";
}) {
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };
  const session = defaultProjectBrowserSession({
    projectId: opts.projectId,
    title: opts.title,
    publishedUrl: opts.publishedUrl,
    spaceId: key.spaceId,
    projectKind: "automation",
    agentSurface: opts.agentSurface,
  });
  setProjectBrowserSession(key, session);
}
