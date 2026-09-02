"use client";

/**
 * Client entry for private AI replies — OpenAI only.
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
  selectedConnectionId?: string | null;
  selectedConnectionIds?: string[] | null;
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
      {
        onProgress: opts.onProgress,
        signal: opts.signal,
        selectedConnectionId: opts.selectedConnectionId ?? null,
        selectedConnectionIds: opts.selectedConnectionIds ?? null,
      },
    );
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
        offline: false,
        condensationOccurred: false,
        runtime: "error",
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
