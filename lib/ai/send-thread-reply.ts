"use client";

/**
 * Client entry for private AI replies.
 *
 * Routes through AIRuntime agent turn (tools + clarification) then providers.
 */

import "@/lib/api/turn-trace-api";
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
  attachmentIds?: string[];
  onProgress?: (progress: AgentTurnProgress) => void;
  signal?: AbortSignal;
}): Promise<{
  aiChatId: string;
  content: string;
  offline: boolean;
  condensationOccurred: boolean;
  runtime?: string;
  pausedForUser?: boolean;
  presentationStreamed?: boolean;
  toolResults?: AiToolCallResult[];
  citations?: AiGenerateResult["citations"];
  blocks?: AiGenerateResult["blocks"];
  generatedAttachmentIds?: string[];
  cancelled?: boolean;
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
        attachmentIds: opts.attachmentIds,
      },
      { onProgress: opts.onProgress, signal: opts.signal },
    );
    // #region agent log
    fetch("http://127.0.0.1:7521/ingest/0b7940f7-640a-4835-98e0-f86faa434abe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "20f195",
      },
      body: JSON.stringify({
        sessionId: "20f195",
        runId: "post-fix",
        hypothesisId: "H1",
        location: "send-thread-reply.ts:result",
        message: "assistant turn result",
        data: {
          runtime: result.runtime,
          offline: result.offline,
          contentPreview: result.content.slice(0, 160),
          bridgeOffline:
            /couldn't reach the AI service/i.test(result.content) ||
            result.offline,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return {
      aiChatId: result.aiChatId ?? opts.aiChatId ?? "",
      content: result.content,
      offline: result.offline,
      condensationOccurred: result.condensationOccurred,
      runtime: result.runtime,
      pausedForUser: result.pausedForUser,
      presentationStreamed: result.presentationStreamed,
      toolResults: result.toolResults,
      citations: result.citations,
      blocks: result.blocks,
      generatedAttachmentIds: result.generatedAttachmentIds,
    };
  } catch (err) {
    if (
      opts.signal?.aborted ||
      (err instanceof AiRuntimeError && err.code === "cancelled") ||
      (err instanceof DOMException && err.name === "AbortError")
    ) {
      return {
        aiChatId: opts.aiChatId ?? "",
        content: "",
        offline: false,
        condensationOccurred: false,
        runtime: "cancelled",
        cancelled: true,
      };
    }
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
