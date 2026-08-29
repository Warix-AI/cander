"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type AiChatDto = {
  id: string;
  owner_id: string;
  workspace_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AiChatMessageDto = {
  id: string;
  chat_id: string;
  owner_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  status: "complete" | "streaming" | "error" | "pending";
  sort_order: number;
  error: string | null;
  created_at: string;
};

export type AiContextRefInput = {
  kind: string;
  id: string;
  workspaceId?: string | null;
};

type AiChatAction =
  | { action: "list_chats" }
  | { action: "create_chat"; title?: string; workspaceId?: string | null; contextRefs?: AiContextRefInput[] }
  | { action: "rename_chat"; chatId: string; title: string }
  | { action: "delete_chat"; chatId: string }
  | { action: "list_messages"; chatId: string }
  | { action: "send_message"; chatId: string; content: string }
  | { action: "set_context"; chatId: string; contextRefs: AiContextRefInput[] };

async function invokeAiChat<T>(body: AiChatAction): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke("ai-chat", { body });
  if (error) {
    let detail = error.message || "AI chat request failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const bodyJson = await ctx.json();
        if (bodyJson?.error) detail = String(bodyJson.error);
      }
    } catch {
      // keep detail
    }
    throw new Error(detail);
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export function listAiChats() {
  return invokeAiChat<{ chats: AiChatDto[] }>({ action: "list_chats" });
}

export function createAiChat(opts?: {
  title?: string;
  workspaceId?: string | null;
  contextRefs?: AiContextRefInput[];
}) {
  return invokeAiChat<{ chat: AiChatDto }>({
    action: "create_chat",
    title: opts?.title,
    workspaceId: opts?.workspaceId,
    contextRefs: opts?.contextRefs,
  });
}

export function renameAiChat(chatId: string, title: string) {
  return invokeAiChat<{ chat: AiChatDto }>({
    action: "rename_chat",
    chatId,
    title,
  });
}

export function deleteAiChat(chatId: string) {
  return invokeAiChat<{ ok: boolean }>({ action: "delete_chat", chatId });
}

export function listAiChatMessages(chatId: string) {
  return invokeAiChat<{ messages: AiChatMessageDto[] }>({
    action: "list_messages",
    chatId,
  });
}

export function sendAiChatMessage(chatId: string, content: string) {
  return invokeAiChat<{
    userMessage: AiChatMessageDto;
    assistantMessage: AiChatMessageDto;
    offline?: boolean;
  }>({ action: "send_message", chatId, content });
}

export function setAiChatContext(chatId: string, contextRefs: AiContextRefInput[]) {
  return invokeAiChat<{ ok: boolean }>({
    action: "set_context",
    chatId,
    contextRefs,
  });
}
