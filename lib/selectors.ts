import type { AssetFile, Project, SpaceId, Thread } from "./types";

type ProjectScope = { projectId: string; workspaceId: string };
type SpaceScope = { space: SpaceId; workspaceId: string };

/** Threads linked to a project within a workspace — no space filter. */
export function threadsForProject(
  threads: Thread[],
  { projectId, workspaceId }: ProjectScope,
): Thread[] {
  return threads.filter(
    (thread) =>
      thread.projectId === projectId && thread.workspaceId === workspaceId,
  );
}

/** Files and outputs linked to a project within a workspace. */
export function assetsForProject(
  assets: AssetFile[],
  { projectId, workspaceId }: ProjectScope,
): AssetFile[] {
  return assets.filter(
    (asset) =>
      asset.projectId === projectId && asset.workspaceId === workspaceId,
  );
}

/** Projects whose home dashboard lives in a given space. */
export function projectsInSpace(
  projects: Project[],
  { space, workspaceId }: SpaceScope,
): Project[] {
  return projects.filter(
    (project) => project.space === space && project.workspaceId === workspaceId,
  );
}

/** Prefer an explicit threadId, else the most recently updated project thread. */
export function latestThreadForProject(
  threads: Thread[],
  project: Pick<Project, "id" | "workspaceId" | "threadId">,
): Thread | undefined {
  if (project.threadId) {
    const explicit = threads.find((thread) => thread.id === project.threadId);
    if (explicit) return explicit;
  }
  return [...threadsForProject(threads, { projectId: project.id, workspaceId: project.workspaceId })].sort(
    (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1),
  )[0];
}
