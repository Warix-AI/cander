import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import type { SpaceProject } from "@/lib/space-entities";
import type { Project, SpaceId } from "@/lib/types";

function toLegacyProject(item: SpaceProject): Project {
  return {
    id: item.id,
    name: item.title,
    space: item.space,
    workspaceId: item.workspaceId,
    summary: item.summary,
    updatedAt: item.updatedAt,
    cover: item.cover,
    threadId: item.threadId,
    domains: item.domains,
  };
}

/** Workspace-scoped projects for intent routing and legacy UI shapes. */
export function projectsForWorkspace(workspaceId: string): Project[] {
  const ctx = { workspaceId, actorId: "local" };
  const fromStore = localSpaceEntityStore.listAllProjects(ctx);
  if (fromStore.length) {
    return fromStore.map(toLegacyProject);
  }
  return getSpaceEntityStoreSnapshot()
    .projects.filter((item) => item.workspaceId === workspaceId)
    .map(toLegacyProject);
}

export function findProjectInWorkspace(
  workspaceId: string,
  id: string,
): Project | undefined {
  const ctx = { workspaceId, actorId: "local" };
  const fromStore = localSpaceEntityStore.getProject(ctx, id);
  if (fromStore) return toLegacyProject(fromStore);
  const fromSnap = getSpaceEntityStoreSnapshot().projects.find(
    (item) => item.id === id && item.workspaceId === workspaceId,
  );
  return fromSnap ? toLegacyProject(fromSnap) : undefined;
}

export function defaultProjectForSpace(
  workspaceId: string,
  space: SpaceId,
): Project | undefined {
  return projectsForWorkspace(workspaceId).find((item) => item.space === space);
}
