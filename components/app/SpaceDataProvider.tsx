"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createLocalApiBundle, type ApiBundle } from "@/lib/api";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import type { WorkspaceCtx } from "@/lib/space-entities";

type SpaceDataContextValue = {
  api: ApiBundle;
  ctx: WorkspaceCtx;
  /** Bump when local entity store mutates. */
  entityRevision: number;
};

const SpaceDataContext = createContext<SpaceDataContextValue | null>(null);

type SpaceDataProviderProps = {
  workspaceId: string;
  actorId?: string;
  children: React.ReactNode;
};

export function SpaceDataProvider({
  workspaceId,
  actorId = "local-user",
  children,
}: SpaceDataProviderProps) {
  const api = useMemo(() => createLocalApiBundle(), []);
  const ctx = useMemo(
    () => ({ workspaceId, actorId }),
    [workspaceId, actorId],
  );

  const entityRevision = useSyncExternalStore(
    subscribeSpaceEntityStore,
    () => getSpaceEntityStoreSnapshot().revision,
    () => getSpaceEntityStoreServerSnapshot().revision,
  );

  const value = useMemo(
    () => ({ api, ctx, entityRevision }),
    [api, ctx, entityRevision],
  );

  return (
    <SpaceDataContext.Provider value={value}>
      {children}
    </SpaceDataContext.Provider>
  );
}

export function useSpaceData() {
  const value = useContext(SpaceDataContext);
  if (!value) {
    throw new Error("useSpaceData must be used within SpaceDataProvider");
  }
  return value;
}

export function useWorkspaceCtx(): WorkspaceCtx {
  return useSpaceData().ctx;
}

export function useSpaceApi(): ApiBundle {
  return useSpaceData().api;
}
