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
import { threadHasTurns } from "@/lib/persistent-chat";
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
  const remoteIds = new Set(remote.map((item) => item.id));
  // Keep local turns that have not landed remotely yet (avoids wiping New Chat).
  const localPending = latest.filter(
    (item) =>
      item.workspaceId === ctx.workspaceId &&
      !remoteIds.has(item.id) &&
      threadHasTurns(item),
  );
  // Prefer fresher local copy of the same thread (avoids flicker / wipe races).
  const mergedRemote = remote.map((remoteThread) => {
    const local = latest.find((item) => item.id === remoteThread.id);
    if (!local || local.workspaceId !== ctx.workspaceId) return remoteThread;
    const localPendingAi = local.messages.some(
      (m) =>
        m.role === "assistant" &&
        (m.status === "pending" ||
          m.status === "streaming" ||
          m.content === "Thinking…" ||
          m.content === "Thinking..."),
    );
    if (localPendingAi) return local;
    if (
      threadHasTurns(local) &&
      local.messages.length > remoteThread.messages.length
    ) {
      return local;
    }
    const localAt = Date.parse(local.updatedAt || "") || 0;
    const remoteAt = Date.parse(remoteThread.updatedAt || "") || 0;
    if (localAt > remoteAt && threadHasTurns(local)) return local;
    return remoteThread;
  });
  replaceChatThreads([...otherWorkspaces, ...mergedRemote, ...localPending]);
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

function threadSyncSig(thread: {
  id: string;
  updatedAt: string;
  title: string;
  snippet: string;
  sessionSummary?: string | null;
  messages: { id: string; content: string; status?: string }[];
}) {
  const last = thread.messages[thread.messages.length - 1];
  return [
    thread.updatedAt,
    thread.title,
    thread.snippet,
    thread.sessionSummary ?? "",
    thread.messages.length,
    last?.id ?? "",
    last?.content?.slice(0, 80) ?? "",
    last?.status ?? "",
  ].join("|");
}

/** Debounced push of local store → Supabase after AppProvider mutations. */
export function startChatRemoteSync(ctx: WorkspaceCtx) {
  let lastRevision = getChatStoreSnapshot().revision;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let syncing = false;
  /** Avoid re-upserting every thread (and stomping timestamps) on each edit. */
  const lastSyncedSig = new Map<string, string>();
  for (const thread of getChatStoreSnapshot().threads) {
    if (thread.workspaceId === ctx.workspaceId) {
      lastSyncedSig.set(thread.id, threadSyncSig(thread));
    }
  }

  const push = () => {
    if (syncing || skipRemoteSync) return;
    const { threads } = getChatStoreSnapshot();
    // Don't sync mid-flight AI placeholders — prevents realtime hydrate from
    // wiping / remapping the in-progress assistant message.
    if (hasPendingAiThinking(threads)) {
      return;
    }
    const dirty = threads.filter((thread) => {
      if (thread.workspaceId !== ctx.workspaceId) return false;
      return lastSyncedSig.get(thread.id) !== threadSyncSig(thread);
    });
    if (!dirty.length) return;
    syncing = true;
    void syncThreadsToSupabase(ctx, dirty)
      .then(() => {
        for (const thread of dirty) {
          lastSyncedSig.set(thread.id, threadSyncSig(thread));
        }
      })
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
