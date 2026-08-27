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
  bootstrapSupabaseEntities,
  startSupabaseEntitySync,
} from "@/lib/api/entity-sync";
import {
  bootstrapSupabaseOrgPolicy,
  startSupabaseOrgPolicySync,
} from "@/lib/api/org-policy-sync";
import {
  bootstrapSupabaseConnectors,
  startSupabaseConnectorSync,
} from "@/lib/api/connector-sync";
import {
  hydrateChatFromRemote,
  startChatRealtimePull,
  startChatRemoteSync,
} from "@/lib/api/chat-sync";
import {
  subscribeChatStore,
  getChatStoreSnapshot,
  getChatStoreServerSnapshot,
} from "@/lib/api/chat-store";
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
  entityRevision: number;
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

    void bootstrapSupabaseEntities(api.entities, ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] entity bootstrap failed", err);
      }
    });

    void bootstrapSupabaseOrgPolicy(ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] org policy bootstrap failed", err);
      }
    });

    void bootstrapSupabaseConnectors(ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] connector bootstrap failed", err);
      }
    });

    void hydrateChatFromRemote(api.chat, ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] initial chat hydrate failed", err);
      }
    });

    const stopEntitySync = startSupabaseEntitySync(api.entities, ctx);
    const stopOrgPolicySync = startSupabaseOrgPolicySync(ctx);
    const stopConnectorSync = startSupabaseConnectorSync(ctx);
    const stopChatSync = startChatRemoteSync(ctx);
    const stopChatRealtime = startChatRealtimePull(api.chat, ctx);

    return () => {
      cancelled = true;
      stopEntitySync();
      stopOrgPolicySync();
      stopConnectorSync();
      stopChatSync();
      stopChatRealtime();
    };
  }, [api.chat, api.entities, backend, ctx]);

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
