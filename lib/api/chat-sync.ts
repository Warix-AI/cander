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
import type { ChatBlock, Thread } from "@/lib/types";
import type { WorkspaceCtx } from "@/lib/space-entities";

const SYNC_DEBOUNCE_MS = 600;
const IMPORT_FLAG_KEY = "courier-chat-imported-v1";

let skipRemoteSync = false;

function messageHasPendingAi(message: Thread["messages"][number]) {
  if (message.role !== "assistant") return false;
  if (
    message.status === "pending" ||
    message.status === "streaming" ||
    message.content === "Thinking…" ||
    message.content === "Thinking..."
  ) {
    return true;
  }
  return Boolean(
    message.blocks?.some(
      (block) =>
        block.type === "image_generation" && block.status === "generating",
    ),
  );
}

function hasPendingAiThinking(threads: ReturnType<typeof getChatStoreSnapshot>["threads"]) {
  return threads.some((thread) =>
    thread.messages.some((message) => messageHasPendingAi(message)),
  );
}

function hasPendingAiInThread(thread: Thread) {
  return thread.messages.some((message) => messageHasPendingAi(message));
}

function mergeMessageBlocks(
  localBlocks: ChatBlock[] | undefined,
  remoteBlocks: ChatBlock[] | undefined,
): ChatBlock[] | undefined {
  if (!remoteBlocks?.length) return localBlocks;
  if (!localBlocks?.length) return remoteBlocks;

  const merged = remoteBlocks.map((remoteBlock, index) => {
    const localBlock =
      localBlocks[index]?.type === remoteBlock.type
        ? localBlocks[index]
        : localBlocks.find((candidate) => blocksMatch(candidate, remoteBlock));
    if (!localBlock || localBlock.type !== remoteBlock.type) return remoteBlock;
    if (remoteBlock.type === "image" && localBlock.type === "image") {
      if (!remoteBlock.url?.trim() && localBlock.url?.trim()) {
        return { ...remoteBlock, url: localBlock.url };
      }
    }
    if (
      remoteBlock.type === "image_generation" &&
      localBlock.type === "image_generation"
    ) {
      if (localBlock.status === "generating") return localBlock;
      if (
        localBlock.status === "completed" &&
        localBlock.imageUrl?.trim() &&
        (!remoteBlock.imageUrl?.trim() ||
          remoteBlock.status !== "completed")
      ) {
        return localBlock;
      }
    }
    return remoteBlock;
  });

  for (const localBlock of localBlocks) {
    if (
      localBlock.type === "image_generation" &&
      (localBlock.status === "generating" ||
        (localBlock.status === "completed" && localBlock.imageUrl?.trim())) &&
      !merged.some((block) => blocksMatch(block, localBlock))
    ) {
      merged.push(localBlock);
    }
  }
  return merged;
}

function blocksMatch(a: ChatBlock, b: ChatBlock): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "image_generation" && b.type === "image_generation") {
    return a.generationId === b.generationId;
  }
  if (a.type === "image" && b.type === "image") {
    return (
      Boolean(a.attachmentId && a.attachmentId === b.attachmentId) ||
      Boolean(a.url && a.url === b.url)
    );
  }
  return false;
}

/** Merge a remote thread hydrate with the in-memory copy to avoid image flicker. */
export function mergeHydratedThread(
  local: Thread | undefined,
  remote: Thread,
): Thread {
  if (!local || local.id !== remote.id) return remote;
  if (hasPendingAiInThread(local)) return local;
  if (
    threadHasTurns(local) &&
    local.messages.length > remote.messages.length
  ) {
    return local;
  }
  const localAt = Date.parse(local.updatedAt || "") || 0;
  const remoteAt = Date.parse(remote.updatedAt || "") || 0;
  // Prefer a fresher local transcript entirely (Default chat hard-replace).
  if (localAt >= remoteAt && threadHasTurns(local)) return local;

  const localIds = new Set(local.messages.map((message) => message.id));
  const remoteHasExtras = remote.messages.some(
    (message) => !localIds.has(message.id),
  );
  // If remote still has prior turns the local replace dropped, keep local.
  if (threadHasTurns(local) && remoteHasExtras) return local;

  const messages = remote.messages.map((remoteMsg) => {
    const localMsg = local.messages.find((m) => m.id === remoteMsg.id);
    if (!localMsg) return remoteMsg;
    const blocks = mergeMessageBlocks(localMsg.blocks, remoteMsg.blocks);
    if (blocks === remoteMsg.blocks) return remoteMsg;
    return { ...remoteMsg, blocks };
  });

  return { ...remote, messages };
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
    return mergeHydratedThread(local, remoteThread);
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
  messages: {
    id: string;
    content: string;
    status?: string;
    blocks?: import("@/lib/types").Message["blocks"];
  }[];
}) {
  const last = thread.messages[thread.messages.length - 1];
  const blockSig =
    last?.blocks
      ?.map((block) => {
        if (block.type === "image_generation") {
          return `${block.generationId}:${block.status}:${block.imageUrl?.slice(0, 96) ?? ""}`;
        }
        if (block.type === "image") {
          return `image:${block.attachmentId ?? block.url?.slice(0, 96) ?? ""}`;
        }
        return block.type;
      })
      .join("|") ?? "";
  return [
    thread.updatedAt,
    thread.title,
    thread.snippet,
    thread.sessionSummary ?? "",
    thread.messages.length,
    last?.id ?? "",
    last?.content?.slice(0, 80) ?? "",
    last?.status ?? "",
    blockSig,
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
