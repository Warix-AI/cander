import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { localSpaceEntityStore, subscribeSpaceEntityStore } from "@/lib/api/space-entity-store";

export function createLocalSpaceEntityApi(): SpaceEntityApi {
  return {
    listProjects: async (ctx, space, filter) =>
      localSpaceEntityStore.listProjects(ctx, space, filter),
    listAllProjects: async (ctx) => localSpaceEntityStore.listAllProjects(ctx),
    getProject: async (ctx, id) => localSpaceEntityStore.getProject(ctx, id),
    createProject: async (ctx, input) =>
      localSpaceEntityStore.createProject(ctx, input),
    updateProject: async (ctx, id, patch) =>
      localSpaceEntityStore.updateProject(ctx, id, patch),
    deleteProject: async (ctx, id) =>
      localSpaceEntityStore.deleteProject(ctx, id),

    listSources: async (ctx, opts) => localSpaceEntityStore.listSources(ctx, opts),
    createSource: async (ctx, input) =>
      localSpaceEntityStore.createSource(ctx, input),
    updateSource: async (ctx, id, patch) =>
      localSpaceEntityStore.updateSource(ctx, id, patch),
    deleteSource: async (ctx, id) =>
      localSpaceEntityStore.deleteSource(ctx, id),

    listBriefingItems: async (ctx, filter) =>
      localSpaceEntityStore.listBriefingItems(ctx, filter),
    mutateBriefingItem: async (ctx, id, action) =>
      localSpaceEntityStore.mutateBriefingItem(ctx, id, action),

    listAttachments: async (ctx) => localSpaceEntityStore.listAttachments(ctx),
    attachToWork: async (ctx, ref) => localSpaceEntityStore.attachToWork(ctx, ref),
    detachFromWork: async (ctx, id) =>
      localSpaceEntityStore.detachFromWork(ctx, id),
    linkReference: async (ctx, ref, target) =>
      localSpaceEntityStore.linkReference(ctx, ref, target),

    listDeployments: async (ctx, projectId) =>
      localSpaceEntityStore.listDeployments(ctx, projectId),
    createDeployment: async (ctx, projectId, input) =>
      localSpaceEntityStore.createDeployment(ctx, projectId, input),

    subscribe: subscribeSpaceEntityStore,
  };
}
