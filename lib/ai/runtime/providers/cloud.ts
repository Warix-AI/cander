"use client";

import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiRuntimeCapabilities,
  AiRuntimeProvider,
} from "@/lib/ai/runtime/types";
import {
  createAiChat,
  sendAiChatMessage,
  setAiChatContext,
  type AiContextRefInput,
} from "@/lib/api/ai-chat-api";
import type { SpaceId } from "@/lib/types";

const OFFLINE_REPLY =
  "I couldn't reach the AI bridge. Check that Ollama, the local bridge, and the HTTPS tunnel are running.";

function buildAiContextRefs(opts: {
  workspaceId: string;
  projectId?: string | null;
  projectSpace?: string | null;
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

/**
 * Existing cloud path: browser → Edge ai-chat → tunnel → bridge → Ollama.
 * Prompts leave the device for inference (and owner-private persistence).
 */
export function createCloudProvider(): AiRuntimeProvider {
  return {
    id: "cloud",

    async getCapabilities(): Promise<AiRuntimeCapabilities> {
      return {
        available: true,
        runtime: "cloud",
        local: false,
        private: false,
        offline: false,
        streaming: false,
        tools: true,
        structuredOutput: false,
      };
    },

    async isAvailable() {
      return true;
    },

    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const contextRefs = buildAiContextRefs({
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        projectSpace: request.projectSpace as SpaceId | null | undefined,
      });

      let chatId = request.aiChatId?.trim() || null;
      try {
        if (!chatId) {
          const { chat } = await createAiChat({
            title: request.title.slice(0, 80) || "New chat",
            workspaceId: request.workspaceId,
          });
          chatId = chat.id;
        }
        await setAiChatContext(chatId, contextRefs).catch(() => {});

        const result = await sendAiChatMessage(chatId, request.content, {
          images: request.images,
        });
        return {
          aiChatId: chatId,
          content:
            result.assistantMessage.content?.trim() ||
            (result.offline ? OFFLINE_REPLY : "(empty reply)"),
          offline: Boolean(result.offline),
          condensationOccurred: Boolean(result.condensation?.occurred),
          runtime: "cloud",
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const offline =
          /failed to fetch|network|offline|bridge|tunnel|503|504/i.test(message);
        return {
          aiChatId: chatId,
          content: offline ? OFFLINE_REPLY : `Something went wrong: ${message}`,
          offline,
          condensationOccurred: false,
          runtime: "cloud",
        };
      }
    },
  };
}
