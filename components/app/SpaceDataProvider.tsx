"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { createApiBundle, type ApiBundle } from "@/lib/api";
import {
  hydrateChatFromRemote,
  startChatRealtimePull,
  startChatRemoteSync,
} from "@/lib/api/chat-sync";
import { subscribeChatStore, getChatStoreSnapshot, getChatStoreServerSnapshot } from "@/lib/api/chat-store";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { getDataBackend } from "@/lib/data-backend";
import type { WorkspaceCtx } from "@/lib/space-entities";

type SpaceDataContextValue = {
  api: ApiBundle;
  ctx: WorkspaceCtx;
  /** Bump when local entity store mutates. */
  entityRevision: number;
  /** Bump when chat store mutates. */
  chatRevision: number;
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
  const backend = getDataBackend();
  const api = useMemo(() => createApiBundle(backend), [backend]);
  const ctx = useMemo(
    () => ({ workspaceId, actorId }),
    [workspaceId, actorId],
  );

  const entityRevision = useSyncExternalStore(
    subscribeSpaceEntityStore,
    () => getSpaceEntityStoreSnapshot().revision,
    () => getSpaceEntityStoreServerSnapshot().revision,
  );

  const chatRevision = useSyncExternalStore(
    subscribeChatStore,
    () => getChatStoreSnapshot().revision,
    () => getChatStoreServerSnapshot().revision,
  );

  useEffect(() => {
    if (backend !== "supabase") return;

    let cancelled = false;
    void hydrateChatFromRemote(api.chat, ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] initial chat hydrate failed", err);
      }
    });

    const stopSync = startChatRemoteSync(ctx);
    const stopRealtime = startChatRealtimePull(api.chat, ctx);

    return () => {
      cancelled = true;
      stopSync();
      stopRealtime();
    };
  }, [api.chat, backend, ctx]);

  const value = useMemo(
    () => ({ api, ctx, entityRevision, chatRevision }),
    [api, ctx, entityRevision, chatRevision],
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
