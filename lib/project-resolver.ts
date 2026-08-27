import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
import type { Project, SpaceId } from "@/lib/types";

/** Workspace-scoped projects for intent routing and legacy UI shapes. */
export function projectsForWorkspace(workspaceId: string): Project[] {
  const ctx = { workspaceId, actorId: "local" };
  const fromStore = localSpaceEntityStore.listAllProjects(ctx);
  return fromStore.map((item) => ({
    id: item.id,
    name: item.title,
    space: item.space,
    workspaceId: item.workspaceId,
    summary: item.summary,
    updatedAt: item.updatedAt,
    cover: item.cover,
    threadId: item.threadId,
    domains: item.domains,
  }));
}

export function findProjectInWorkspace(
  workspaceId: string,
  id: string,
): Project | undefined {
  const ctx = { workspaceId, actorId: "local" };
  const fromStore = localSpaceEntityStore.getProject(ctx, id);
  if (!fromStore) return undefined;
  return {
    id: fromStore.id,
    name: fromStore.title,
    space: fromStore.space,
    workspaceId: fromStore.workspaceId,
    summary: fromStore.summary,
    updatedAt: fromStore.updatedAt,
    cover: fromStore.cover,
    threadId: fromStore.threadId,
    domains: fromStore.domains,
  };
}

export function defaultProjectForSpace(
  workspaceId: string,
  space: SpaceId,
): Project | undefined {
  return projectsForWorkspace(workspaceId).find((item) => item.space === space);
}
