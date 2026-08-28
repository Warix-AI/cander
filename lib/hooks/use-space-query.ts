"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import {
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import type {
  BriefingFilter,
  Deployment,
  ProjectFilter,
  SourceFilter,
  SpaceAttachment,
  SpaceProject,
  SpaceSource,
} from "@/lib/space-entities";
import type { SpaceId } from "@/lib/types";

/** Stable dependency for optional filter objects passed inline from components. */
function filterDepKey(filter: unknown) {
  if (filter === undefined) return "";
  try {
    return JSON.stringify(filter);
  } catch {
    return String(filter);
  }
}

function cacheHasItems<T>(cache: T) {
  if (Array.isArray(cache)) return cache.length > 0;
  return cache != null;
}

function useAsyncQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  cache: T,
  cacheReady = false,
) {
  const hasCache = cacheReady && cacheHasItems(cache);
  const [remote, setRemote] = useState<T | null>(null);
  const [loading, setLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(hasCache);
  const painted = useRef<T | null>(hasCache ? cache : null);

  useEffect(() => {
    let cancelled = false;
    if (!loaded.current && painted.current == null && !hasCache) {
      setLoading(true);
    }
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setRemote(result);
          loaded.current = true;
          painted.current = result;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
        }
      })
      .finally(() => {
        loaded.current = true;
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by deps array
  }, deps);

  const data =
    remote !== null
      ? remote
      : cacheHasItems(cache)
        ? cache
        : (painted.current ?? cache);
  if (painted.current == null && cacheHasItems(cache)) {
    painted.current = cache;
  }

  // Cached or last-painted rows stay on screen; never skeleton a background refetch.
  return {
    data,
    loading: loading && !hasCache && painted.current == null,
    error,
  };
}

export function useSpaceProjects(space: SpaceId, filter?: ProjectFilter) {
  const { api, ctx, entityRevision } = useSpaceData();
  const filterKey = filterDepKey(filter);
  const snap = getSpaceEntityStoreSnapshot();
  const cache = snap.seeded
    ? localSpaceEntityStore.listProjects(ctx, space, filter)
    : [];
  return useAsyncQuery(
    () => api.entities.listProjects(ctx, space, filter),
    [api.entities, ctx, space, filterKey, entityRevision],
    cache,
    snap.seeded,
  );
}

export function useSpaceProject(id: string | null) {
  const { api, ctx, entityRevision } = useSpaceData();
  const { data, loading, error } = useAsyncQuery(
    () => (id ? api.entities.getProject(ctx, id) : Promise.resolve(null)),
    [api.entities, ctx, id, entityRevision],
    null as SpaceProject | null,
  );
  return { project: data, loading, error };
}

export function useSpaceSources(filter?: SourceFilter) {
  const { api, ctx, entityRevision } = useSpaceData();
  const filterKey = filterDepKey(filter);
  const snap = getSpaceEntityStoreSnapshot();
  const cache = snap.seeded
    ? localSpaceEntityStore.listSources(ctx, filter)
    : [];
  return useAsyncQuery(
    () => api.entities.listSources(ctx, filter),
    [api.entities, ctx, filterKey, entityRevision],
    cache,
    snap.seeded,
  );
}

export function useSpaceBriefingItems(filter?: BriefingFilter) {
  const { api, ctx, entityRevision } = useSpaceData();
  const filterKey = filterDepKey(filter);
  const snap = getSpaceEntityStoreSnapshot();

  // One-shot ingest per workspace/filter. Must not depend on entityRevision:
  // syncBriefing notifies the entity store on success, which would re-run this
  // effect and loop (Maximum update depth).
  useEffect(() => {
    void api.connectors.syncBriefing(ctx, filter).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter keyed by filterKey
  }, [api.connectors, ctx, filterKey]);

  return useAsyncQuery(
    () => api.entities.listBriefingItems(ctx, filter),
    [api.entities, ctx, filterKey, entityRevision],
    snap.seeded ? localSpaceEntityStore.listBriefingItems(ctx, filter) : [],
    snap.seeded,
  );
}

export function useSpaceAttachments() {
  const { api, ctx, entityRevision } = useSpaceData();
  return useAsyncQuery(
    () => api.entities.listAttachments(ctx),
    [api.entities, ctx, entityRevision],
    [] as SpaceAttachment[],
  );
}

export function useConnectedConnectors() {
  const { api, ctx } = useSpaceData();
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!loaded.current) setLoading(true);
      api.connectors
        .listConnected(ctx)
        .then((result) => {
          if (!cancelled) {
            setIds(result);
            loaded.current = true;
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const unsub = api.connectors.subscribe?.(() => load());
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [api.connectors, ctx]);

  return { connectorIds: ids, loading: loading && ids.length === 0 };
}

export function useProjectDeployments(projectId: string | null) {
  const { api, ctx, entityRevision } = useSpaceData();
  return useAsyncQuery(
    () =>
      projectId
        ? api.entities.listDeployments(ctx, projectId)
        : Promise.resolve([]),
    [api.entities, ctx, projectId, entityRevision],
    [] as Deployment[],
  );
}

export function useSpaceMutation() {
  const { api, ctx } = useSpaceData();

  const createProject = useCallback(
    (...args: Parameters<typeof api.entities.createProject>) =>
      api.entities.createProject(...args),
    [api.entities],
  );

  const updateProject = useCallback(
    (...args: Parameters<typeof api.entities.updateProject>) =>
      api.entities.updateProject(...args),
    [api.entities],
  );

  const deleteProject = useCallback(
    (...args: Parameters<typeof api.entities.deleteProject>) =>
      api.entities.deleteProject(...args),
    [api.entities],
  );

  const attachToWork = useCallback(
    (...args: Parameters<typeof api.entities.attachToWork>) =>
      api.entities.attachToWork(...args),
    [api.entities],
  );

  const detachFromWork = useCallback(
    (attachmentId: string) =>
      api.entities.detachFromWork(ctx, attachmentId),
    [api.entities, ctx],
  );

  const createSource = useCallback(
    (...args: Parameters<typeof api.entities.createSource>) =>
      api.entities.createSource(...args),
    [api.entities],
  );

  const publishBuild = useCallback(
    (projectId: string, url?: string) =>
      api.build.publish(ctx, projectId, { url }),
    [api.build, ctx],
  );

  const captureBrowserReference = useCallback(
    (page: { url: string; title: string }, opts?: { projectId?: string }) =>
      api.browser.captureReference(ctx, page, {
        space: "research",
        projectId: opts?.projectId,
      }),
    [api.browser, ctx],
  );

  const connectConnector = useCallback(
    (connectorId: string) => api.connectors.connect(ctx, connectorId),
    [api.connectors, ctx],
  );

  const mutateBriefing = useCallback(
    (...args: Parameters<typeof api.entities.mutateBriefingItem>) =>
      api.entities.mutateBriefingItem(...args),
    [api.entities],
  );

  return {
    createProject,
    updateProject,
    deleteProject,
    attachToWork,
    detachFromWork,
    createSource,
    publishBuild,
    captureBrowserReference,
    connectConnector,
    mutateBriefing,
  };
}
