"use client";

import type { ChatApi } from "@/lib/api/chat-api";
import {
  getChatStoreSnapshot,
  replaceChatThreads,
  subscribeChatStore,
} from "@/lib/api/chat-store";
import {
  subscribeChatRealtime,
  syncThreadsToSupabase,
} from "@/lib/api/chat-api.supabase";
import type { WorkspaceCtx } from "@/lib/space-entities";

const SYNC_DEBOUNCE_MS = 600;

let skipRemoteSync = false;

/** Pull remote threads into the local chat store. */
export async function hydrateChatFromRemote(
  api: ChatApi,
  ctx: WorkspaceCtx,
) {
  skipRemoteSync = true;
  const threads = await api.listThreads(ctx);
  replaceChatThreads(threads);
  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

/** Debounced push of local store → Supabase after AppProvider mutations. */
export function startChatRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getChatStoreSnapshot().revision;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    syncing = true;
    const { threads } = getChatStoreSnapshot();
    void syncThreadsToSupabase(ctx, threads)
      .catch((err) => {
        console.warn("[cander] chat sync failed", err);
      })
      .finally(() => {
        syncing = false;
      });
  };

  const unsubStore = subscribeChatStore(() => {
    if (skipRemoteSync) return;
    const snap = getChatStoreSnapshot();
    if (snap.revision === lastRevision) return;
    lastRevision = snap.revision;
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, SYNC_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubStore();
  };
}

/** Realtime pull — refresh store when remote rows change. */
export function startChatRealtimePull(api: ChatApi, ctx: WorkspaceCtx) {
  let pulling = false;

  const pull = () => {
    if (pulling) return;
    pulling = true;
    void hydrateChatFromRemote(api, ctx)
      .catch((err) => {
        console.warn("[cander] chat hydrate failed", err);
      })
      .finally(() => {
        pulling = false;
      });
  };

  return subscribeChatRealtime(ctx, pull);
}

export { createSupabaseChatApi } from "@/lib/api/chat-api.supabase";
