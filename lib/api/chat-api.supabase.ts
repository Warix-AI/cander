"use client";

import type { ChatApi } from "@/lib/api/chat-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  messageRowToMessage,
  messageToRow,
  messageToUpsertRow,
  threadRowToThread,
  threadToRow,
  type MessageRow,
  type ThreadRow,
} from "@/lib/supabase/chat-mapper";
import { supabaseUrl } from "@/lib/supabase/env";
import type {
  CreateThreadInput,
  SendMessageInput,
  ThreadFilter,
  WorkspaceCtx,
} from "@/lib/space-entities";
import type { Message, Thread } from "@/lib/types";
import { imageCoverFromBlocks, imageCoverFromMessages } from "@/lib/chat-image-cover";

const MESSAGE_COLUMNS_LIGHT =
  "id, thread_id, workspace_id, role, content, at_label, space_switch, citations, sort_order, created_at";

const MESSAGE_PAGE_SIZE = 1000;

async function loadMessagesForThreads(
  threadIds: string[],
  opts?: { includeBlocks?: boolean },
) {
  if (!threadIds.length) return new Map<string, Message[]>();
  const supabase = createSupabaseBrowserClient();
  const allRows: MessageRow[] = [];
  let offset = 0;

  while (true) {
    const base = supabase.from("messages");
    const { data, error } = opts?.includeBlocks
      ? await base
          .select("*")
          .in("thread_id", threadIds)
          .order("sort_order", { ascending: true })
          .range(offset, offset + MESSAGE_PAGE_SIZE - 1)
      : await base
          .select(MESSAGE_COLUMNS_LIGHT)
          .in("thread_id", threadIds)
          .order("sort_order", { ascending: true })
          .range(offset, offset + MESSAGE_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as MessageRow[];
    allRows.push(...batch);
    if (batch.length < MESSAGE_PAGE_SIZE) break;
    offset += MESSAGE_PAGE_SIZE;
  }

  const grouped = new Map<string, Message[]>();
  for (const row of allRows) {
    const list = grouped.get(row.thread_id) ?? [];
    list.push(messageRowToMessage(row));
    grouped.set(row.thread_id, list);
  }
  return grouped;
}

async function loadThreadCoverUrls(threadIds: string[]) {
  const covers = new Map<string, string>();
  if (!threadIds.length) return covers;

  const supabase = createSupabaseBrowserClient();
  const pending = new Set(threadIds);
  let offset = 0;

  while (pending.size > 0) {
    const { data, error } = await supabase
      .from("messages")
      .select("thread_id, blocks, sort_order")
      .in("thread_id", threadIds)
      .not("blocks", "is", null)
      .order("sort_order", { ascending: false })
      .range(offset, offset + MESSAGE_PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data ?? []) as Pick<MessageRow, "thread_id" | "blocks">[];
    if (!batch.length) break;

    for (const row of batch) {
      if (covers.has(row.thread_id)) continue;
      const url = imageCoverFromBlocks(row.blocks);
      if (url) {
        covers.set(row.thread_id, url);
        pending.delete(row.thread_id);
      }
    }

    if (batch.length < MESSAGE_PAGE_SIZE) break;
    offset += MESSAGE_PAGE_SIZE;
  }

  return covers;
}

function applyFilter(threads: Thread[], filter?: ThreadFilter) {
  if (!filter) return threads;
  return threads.filter((item) => {
    if (filter.spaceId && item.spaceId !== filter.spaceId) return false;
    if (filter.projectId && item.projectId !== filter.projectId) return false;
    return true;
  });
}

async function callChatSendEdge(opts: {
  threadId: string;
  workspaceId: string;
  content: string;
  spaceId?: string | null;
}) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("chat-send", {
    body: opts,
  });
  if (error) throw error;
  return data as { message: Message };
}

export function createSupabaseChatApi(): ChatApi {
  return {
    async getThreadCoverUrls(_ctx, threadIds) {
      return loadThreadCoverUrls(threadIds);
    },

    async listThreads(ctx, filter) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("threads")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as ThreadRow[];
      const messageMap = await loadMessagesForThreads(
        rows.map((row) => row.id),
        { includeBlocks: false },
      );
      const threads = rows.map((row) =>
        threadRowToThread(row, messageMap.get(row.id) ?? []),
      );
      return applyFilter(threads, filter);
    },

    async getThread(ctx, id) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("threads")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = data as ThreadRow;
      const messageMap = await loadMessagesForThreads([row.id], {
        includeBlocks: true,
      });
      return threadRowToThread(row, messageMap.get(row.id) ?? []);
    },

    async createThread(ctx, input: CreateThreadInput) {
      const supabase = createSupabaseBrowserClient();
      const thread: Thread = {
        id: `t-${crypto.randomUUID().slice(0, 8)}`,
        title: input.title ?? "Chat",
        workspaceId: ctx.workspaceId,
        projectId: input.projectId,
        spaceId: input.spaceId,
        updatedAt: new Date().toISOString(),
        snippet: "",
        messages: [],
        createdBy: ctx.actorId,
      };
      const row = threadToRow(thread, ctx.actorId);
      const { error } = await supabase.from("threads").insert(row);
      if (error) throw error;
      return thread;
    },

    async listMessages(ctx, threadId) {
      const thread = await this.getThread(ctx, threadId);
      return thread?.messages ?? [];
    },

    async sendMessage(ctx, threadId, input: SendMessageInput) {
      const trimmed = input.content.trim();
      if (!trimmed) throw new Error("Message cannot be empty");

      const supabase = createSupabaseBrowserClient();
      const thread = await this.getThread(ctx, threadId);
      if (!thread) throw new Error("Thread not found");

      const userMsg: Message = {
        id: `u-${crypto.randomUUID().slice(0, 8)}`,
        role: "user",
        content: trimmed,
        at: new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      };

      const userRow = messageToRow(
        userMsg,
        threadId,
        ctx.workspaceId,
        thread.messages.length,
      );
      const { error: userError } = await supabase.from("messages").insert(userRow);
      if (userError) throw userError;

      let assistantMsg: Message;
      try {
        const result = await callChatSendEdge({
          threadId,
          workspaceId: ctx.workspaceId,
          content: trimmed,
          spaceId: thread.spaceId,
        });
        assistantMsg = result.message;
      } catch {
        assistantMsg = {
          id: `a-${crypto.randomUUID().slice(0, 8)}`,
          role: "assistant",
          content: "Got it — I'll keep working on that.",
          at: new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        };
      }

      const assistantRow = messageToRow(
        assistantMsg,
        threadId,
        ctx.workspaceId,
        thread.messages.length + 1,
      );
      const { error: assistantError } = await supabase
        .from("messages")
        .insert(assistantRow);
      if (assistantError) throw assistantError;

      await supabase
        .from("threads")
        .update({
          title: thread.messages.length ? thread.title : trimmed.slice(0, 48),
          snippet: trimmed,
          session_summary: null,
        })
        .eq("id", threadId)
        .eq("workspace_id", ctx.workspaceId);

      return assistantMsg;
    },
  };
}

/** Upsert workspace threads + messages after local store mutations. */
export async function syncThreadsToSupabase(
  ctx: WorkspaceCtx,
  threads: Thread[],
) {
  const scoped = threads.filter((item) => item.workspaceId === ctx.workspaceId);
  await upsertThreadsToSupabase(ctx, scoped);
}

/** Upsert all threads (first-login import across workspaces). */
export async function upsertThreadsToSupabase(
  ctx: WorkspaceCtx,
  threads: Thread[],
) {
  if (!threads.length) return;

  const supabase = createSupabaseBrowserClient();
  const ids = threads.map((thread) => thread.id);
  const { data: existingRows } = await supabase
    .from("threads")
    .select("id, created_by, created_at")
    .in("id", ids);
  const existingMeta = new Map(
    (existingRows ?? []).map((row) => [
      String(row.id),
      {
        createdBy: row.created_by ? String(row.created_by) : null,
        createdAt: row.created_at ? String(row.created_at) : null,
      },
    ]),
  );

  const threadRows = threads.map((thread) => {
    const meta = existingMeta.get(thread.id);
    const createdBy = meta?.createdBy ?? thread.createdBy ?? ctx.actorId;
    return threadToRow(
      { ...thread, createdBy },
      createdBy,
      meta?.createdAt ?? null,
    );
  });
  const { error: threadError } = await supabase
    .from("threads")
    .upsert(threadRows, { onConflict: "id" });
  if (threadError) throw threadError;

  const messageRows = threads.flatMap((thread) =>
    thread.messages.map((message, index) =>
      messageToUpsertRow(message, thread.id, thread.workspaceId, index),
    ),
  );
  if (messageRows.length) {
    const { error: messageError } = await supabase
      .from("messages")
      .upsert(messageRows, { onConflict: "id" });
    if (messageError) throw messageError;
  }

  // Drop orphaned server messages so promoted defaults don't keep old turns.
  for (const thread of threads) {
    const keepIds = thread.messages.map((message) => message.id);
    if (!keepIds.length) {
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("thread_id", thread.id);
      if (error) {
        console.warn("[cander] prune thread messages failed", thread.id, error);
      }
      continue;
    }
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("thread_id", thread.id)
      .not("id", "in", `(${keepIds.join(",")})`);
    if (error) {
      console.warn("[cander] prune thread messages failed", thread.id, error);
    }
  }
}

/** Soft-remove threads that were replaced (e.g. Default chat promote). */
export async function deleteThreadsFromSupabase(
  ctx: WorkspaceCtx,
  threadIds: string[],
) {
  const ids = [...new Set(threadIds.filter(Boolean))];
  if (!ids.length) return;
  const supabase = createSupabaseBrowserClient();
  await supabase.from("messages").delete().in("thread_id", ids);
  await supabase
    .from("threads")
    .delete()
    .in("id", ids)
    .eq("workspace_id", ctx.workspaceId);
}

export function chatRealtimeChannelName(workspaceId: string) {
  return `chat:${workspaceId}`;
}

/** Subscribe to thread/message changes for a workspace. */
export function subscribeChatRealtime(
  ctx: WorkspaceCtx,
  onChange: () => void,
) {
  const supabase = createSupabaseBrowserClient();
  const channel = supabase
    .channel(chatRealtimeChannelName(ctx.workspaceId))
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "threads",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: `workspace_id=eq.${ctx.workspaceId}`,
      },
      () => onChange(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Edge function URL — exposed for diagnostics. */
export function chatSendFunctionUrl() {
  return `${supabaseUrl()}/functions/v1/chat-send`;
}
