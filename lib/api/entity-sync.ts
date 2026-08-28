"use client";

import type { SpaceEntityApi } from "@/lib/api/space-entity-api";
import { subscribeEntityRealtime } from "@/lib/api/space-entity-api.supabase";
import {
  notifyEntityStoreChange,
  replaceEntityStoreState,
} from "@/lib/api/space-entity-store";
import type { WorkspaceCtx } from "@/lib/space-entities";

const IMPORT_FLAG_KEY = "courier-entities-imported-v1";

/** One-time upsert of localStorage entities → Supabase after first auth.
 * Live accounts stay empty — leftover prototype catalogs are not imported.
 */
export async function importLocalEntitiesIfNeeded(_ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMPORT_FLAG_KEY, "1");
}

/** Pull remote entities into local store (AppProvider + legacy reads). */
export async function hydrateEntityStoreFromRemote(
  api: SpaceEntityApi,
  ctx: WorkspaceCtx,
) {
  const [projects, sources, briefingItems, attachments] = await Promise.all([
    api.listAllProjects(ctx),
    api.listSources(ctx),
    api.listBriefingItems(ctx),
    api.listAttachments(ctx),
  ]);

  const deployments = (
    await Promise.all(
      projects.map((project) => api.listDeployments(ctx, project.id)),
    )
  ).flat();

  replaceEntityStoreState({
    projects,
    sources,
    briefingItems,
    deployments,
    attachments,
    seeded: true,
  });
}

/** Realtime — bump revision so hooks refetch. */
export function startEntityRealtimePull(api: SpaceEntityApi, ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void hydrateEntityStoreFromRemote(api, ctx)
      .catch((err) => {
        console.warn("[cander] entity hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  const unsubRealtime = subscribeEntityRealtime(ctx, () => {
    notifyEntityStoreChange();
    pull();
  });

  return () => {
    unsubRealtime();
  };
}

export async function bootstrapSupabaseEntities(
  api: SpaceEntityApi,
  ctx: WorkspaceCtx,
) {
  await importLocalEntitiesIfNeeded(ctx);
  await hydrateEntityStoreFromRemote(api, ctx);
}

export function startSupabaseEntitySync(api: SpaceEntityApi, ctx: WorkspaceCtx) {
  return startEntityRealtimePull(api, ctx);
}
