"use client";

/**
 * Client entry for private AI replies.
 *
 * Routes through AIRuntime agent turn (tools + clarification) then providers.
 */

import {
  runAssistantTurn,
  type AgentTurnProgress,
} from "@/lib/ai/runtime/agent-turn";
import type { AiToolCallResult } from "@/lib/ai/runtime/tools";
import { AiRuntimeError, type AiGenerateResult } from "@/lib/ai/runtime/types";
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
  images?: string[];
  onProgress?: (progress: AgentTurnProgress) => void;
}): Promise<{
  aiChatId: string;
  content: string;
  offline: boolean;
  condensationOccurred: boolean;
  runtime?: string;
  pausedForUser?: boolean;
  toolResults?: AiToolCallResult[];
  citations?: AiGenerateResult["citations"];
}> {
  try {
    const result = await runAssistantTurn(
      {
        aiChatId: opts.aiChatId,
        threadId: opts.threadId,
        title: opts.title,
        content: opts.content,
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        projectSpace: opts.projectSpace,
        messages: opts.messages,
        images: opts.images,
      },
      { onProgress: opts.onProgress },
    );
    return {
      aiChatId: result.aiChatId ?? opts.aiChatId ?? "",
      content: result.content,
      offline: result.offline,
      condensationOccurred: result.condensationOccurred,
      runtime: result.runtime,
      pausedForUser: result.pausedForUser,
      toolResults: result.toolResults,
      citations: result.citations,
    };
  } catch (err) {
    if (err instanceof AiRuntimeError) {
      return {
        aiChatId: opts.aiChatId ?? "",
        content: err.message,
        offline: err.code === "local_unavailable",
        condensationOccurred: false,
        runtime: err.code === "vision_requires_cloud" ? "cloud" : "unavailable",
      };
    }
    const message =
      err instanceof Error && err.message.trim()
        ? err.message.trim().slice(0, 280)
        : "Something went wrong generating a reply.";
    console.error("[PRIVATE_AI_REPLY_THROW]", { message });
    return {
      aiChatId: opts.aiChatId ?? "",
      content: message,
      offline: false,
      condensationOccurred: false,
      runtime: "error",
    };
  }
}
