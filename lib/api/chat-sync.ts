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
const IMPORT_FLAG_KEY = "courier-chat-imported-v1";

let skipRemoteSync = false;

function hasPendingAiThinking(threads: ReturnType<typeof getChatStoreSnapshot>["threads"]) {
  return threads.some((thread) =>
    thread.messages.some(
      (m) =>
        m.role === "assistant" &&
        (m.status === "pending" ||
          m.status === "streaming" ||
          m.content === "Thinking…" ||
          m.content === "Thinking..."),
    ),
  );
}

/** Pull remote threads for the active workspace; keep other workspaces in store. */
export async function hydrateChatFromRemote(
  api: ChatApi,
  ctx: WorkspaceCtx,
) {
  const { threads: current } = getChatStoreSnapshot();
  if (hasPendingAiThinking(current)) return;

  skipRemoteSync = true;
  const remote = await api.listThreads(ctx);
  const { threads: latest } = getChatStoreSnapshot();
  if (hasPendingAiThinking(latest)) {
    window.setTimeout(() => {
      skipRemoteSync = false;
    }, 0);
    return;
  }
  const otherWorkspaces = latest.filter(
    (item) => item.workspaceId !== ctx.workspaceId,
  );
  replaceChatThreads([...otherWorkspaces, ...remote]);
  window.setTimeout(() => {
    skipRemoteSync = false;
  }, 0);
}

/** One-time upsert of localStorage threads → Supabase after first auth.
 * Live accounts stay empty — leftover prototype threads are not imported.
 */
export async function importLocalChatIfNeeded(_ctx: WorkspaceCtx) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IMPORT_FLAG_KEY, "1");
}

export async function bootstrapSupabaseChat(api: ChatApi, ctx: WorkspaceCtx) {
  await importLocalChatIfNeeded(ctx);
  await hydrateChatFromRemote(api, ctx);
}

/** Debounced push of local store → Supabase after AppProvider mutations. */
export function startChatRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getChatStoreSnapshot().revision;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;

  const push = () => {
    if (syncing || skipRemoteSync) return;
    const { threads } = getChatStoreSnapshot();
    // Don't sync mid-flight AI placeholders — prevents realtime hydrate from
    // wiping / remapping the in-progress assistant message.
    if (hasPendingAiThinking(threads)) {
      return;
    }
    syncing = true;
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
    if (hasPendingAiThinking(getChatStoreSnapshot().threads)) return;
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
