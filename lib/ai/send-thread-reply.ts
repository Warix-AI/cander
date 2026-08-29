"use client";

import {
  createAiChat,
  sendAiChatMessage,
  setAiChatContext,
  type AiContextRefInput,
} from "@/lib/api/ai-chat-api";
import type { SpaceId } from "@/lib/types";

export function buildAiContextRefs(opts: {
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: SpaceId | null;
}): AiContextRefInput[] {
  const refs: AiContextRefInput[] = [
    {
      kind: "workspace",
      id: opts.workspaceId,
      workspaceId: opts.workspaceId,
    },
  ];
  if (opts.projectId) {
    const kind = opts.projectSpace === "research" ? "research" : "project";
    refs.push({
      kind,
      id: opts.projectId,
      workspaceId: opts.workspaceId,
    });
  }
  return refs;
}

const OFFLINE_REPLY =
  "I couldn't reach the AI bridge. Check that Ollama, the local bridge, and the HTTPS tunnel are running.";

/**
 * Ensure a private AI chat exists for this UI thread, attach context, send message.
 */
export async function fetchPrivateAiReply(opts: {
  aiChatId?: string | null;
  title: string;
  content: string;
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: SpaceId | null;
}): Promise<{ aiChatId: string; content: string; offline: boolean }> {
  const contextRefs = buildAiContextRefs({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    projectSpace: opts.projectSpace,
  });

  let chatId = opts.aiChatId?.trim() || null;
  if (!chatId) {
    const { chat } = await createAiChat({
      title: opts.title.slice(0, 80) || "New chat",
      workspaceId: opts.workspaceId,
      contextRefs,
    });
    chatId = chat.id;
  } else {
    await setAiChatContext(chatId, contextRefs).catch(() => {
      // Non-fatal — send still works without refreshed context.
    });
  }

  try {
    const result = await sendAiChatMessage(chatId, opts.content);
    return {
      aiChatId: chatId,
      content:
        result.assistantMessage.content?.trim() ||
        (result.offline ? OFFLINE_REPLY : "(empty reply)"),
      offline: Boolean(result.offline),
    };
  } catch {
    return {
      aiChatId: chatId,
      content: OFFLINE_REPLY,
      offline: true,
    };
  }
}
