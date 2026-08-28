"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { createApiBundle, type ApiBundle } from "@/lib/api";
import { startSupabaseEntitySync } from "@/lib/api/entity-sync";
import { startSupabaseOrgPolicySync } from "@/lib/api/org-policy-sync";
import { startSupabaseConnectorSync } from "@/lib/api/connector-sync";
import { startSupabaseBrowserSync } from "@/lib/api/browser-sync";
import {
  startChatRealtimePull,
  startChatRemoteSync,
} from "@/lib/api/chat-sync";
import { bootstrapSupabaseSession, startAppearanceRemoteSync } from "@/lib/import/bootstrap-supabase";
import {
  bootstrapSupabaseAppearance,
  isAppearanceActorId,
} from "@/lib/api/appearance-sync";
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
import {
  getSessionReadyServerSnapshot,
  getSessionReadySnapshot,
  subscribeSessionReady,
} from "@/lib/session-ready";
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
  const sessionReady = useSyncExternalStore(
    subscribeSessionReady,
    getSessionReadySnapshot,
    getSessionReadyServerSnapshot,
  );
  const appearanceBootstrapped = useRef(false);

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

  const canSyncAppearance =
    backend === "supabase" &&
    sessionReady &&
    isAppearanceActorId(actorId);

  useEffect(() => {
    if (backend !== "supabase") return;

    let cancelled = false;

    void bootstrapSupabaseSession(api, ctx).catch((err) => {
      if (!cancelled) {
        console.warn("[cander] supabase bootstrap failed", err);
      }
    });

    const stopEntitySync = startSupabaseEntitySync(api.entities, ctx);
    const stopOrgPolicySync = startSupabaseOrgPolicySync(ctx);
    const stopConnectorSync = startSupabaseConnectorSync(ctx);
    const stopBrowserSync = startSupabaseBrowserSync(ctx);
    const stopChatSync = startChatRemoteSync(ctx);
    const stopChatRealtime = startChatRealtimePull(api.chat, ctx);

    return () => {
      cancelled = true;
      stopEntitySync();
      stopOrgPolicySync();
      stopConnectorSync();
      stopBrowserSync();
      stopChatSync();
      stopChatRealtime();
    };
  }, [api, backend, ctx]);

  useEffect(() => {
    if (!canSyncAppearance) {
      appearanceBootstrapped.current = false;
      return;
    }

    let stopAppearanceSync = () => {};

    void bootstrapSupabaseAppearance(ctx)
      .catch((err) => {
        console.warn("[cander] appearance bootstrap failed", err);
      })
      .finally(() => {
        appearanceBootstrapped.current = true;
        stopAppearanceSync = startAppearanceRemoteSync(ctx);
      });

    return () => {
      stopAppearanceSync();
    };
  }, [canSyncAppearance, ctx]);

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
