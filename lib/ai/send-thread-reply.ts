"use client";

/**
 * Client entry for private AI replies.
 *
 * Routes through AIRuntime agent turn (tools + clarification) then providers.
 */

import { runAssistantTurn } from "@/lib/ai/runtime/agent-turn";
import { AiRuntimeError } from "@/lib/ai/runtime/types";
import type { SpaceId } from "@/lib/types";

export function buildAiContextRefs(opts: {
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: SpaceId | null;
}) {
  const refs: Array<{
    kind: "workspace" | "project" | "research";
    id: string;
    workspaceId: string;
  }> = [
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

/**
 * Ensure a private AI chat exists for this UI thread, attach context, send message.
 */
export async function fetchPrivateAiReply(opts: {
  aiChatId?: string | null;
  threadId?: string | null;
  title: string;
  content: string;
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: SpaceId | null;
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}): Promise<{
  aiChatId: string;
  content: string;
  offline: boolean;
  condensationOccurred: boolean;
  runtime?: string;
  pausedForUser?: boolean;
  toolLabels?: string[];
}> {
  try {
    const result = await runAssistantTurn({
      aiChatId: opts.aiChatId,
      threadId: opts.threadId,
      title: opts.title,
      content: opts.content,
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      projectSpace: opts.projectSpace,
      messages: opts.messages,
    });
    return {
      aiChatId: result.aiChatId ?? opts.aiChatId ?? "",
      content: result.content,
      offline: result.offline,
      condensationOccurred: result.condensationOccurred,
      runtime: result.runtime,
      pausedForUser: result.pausedForUser,
      toolLabels: result.toolResults?.map((t) => t.name),
    };
  } catch (err) {
    if (err instanceof AiRuntimeError) {
      return {
        aiChatId: opts.aiChatId ?? "",
        content: err.message,
        offline: err.code === "local_unavailable",
        condensationOccurred: false,
        runtime: "unavailable",
      };
    }
    throw err;
  }
}
