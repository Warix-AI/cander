"use client";

import type { ChatApi } from "@/lib/api/chat-api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  messageRowToMessage,
  messageToRow,
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

async function loadMessagesForThreads(threadIds: string[]) {
  if (!threadIds.length) return new Map<string, Message[]>();
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .in("thread_id", threadIds)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const grouped = new Map<string, Message[]>();
  for (const row of (data ?? []) as MessageRow[]) {
    const list = grouped.get(row.thread_id) ?? [];
    list.push(messageRowToMessage(row));
    grouped.set(row.thread_id, list);
  }
  return grouped;
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
    async listThreads(ctx, filter) {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("threads")
        .select("*")
        .eq("workspace_id", ctx.workspaceId)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as ThreadRow[];
      const messageMap = await loadMessagesForThreads(rows.map((row) => row.id));
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
      const messageMap = await loadMessagesForThreads([row.id]);
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
        updatedAt: "Just now",
        snippet: "",
        messages: [],
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
  const supabase = createSupabaseBrowserClient();
  const scoped = threads.filter((item) => item.workspaceId === ctx.workspaceId);
  if (!scoped.length) return;

  const threadRows = scoped.map((thread) => threadToRow(thread, ctx.actorId));
  const { error: threadError } = await supabase
    .from("threads")
    .upsert(threadRows, { onConflict: "id" });
  if (threadError) throw threadError;

  const messageRows = scoped.flatMap((thread) =>
    thread.messages.map((message, index) =>
      messageToRow(message, thread.id, thread.workspaceId, index),
    ),
  );
  if (!messageRows.length) return;

  const { error: messageError } = await supabase
    .from("messages")
    .upsert(messageRows, { onConflict: "id" });
  if (messageError) throw messageError;
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
