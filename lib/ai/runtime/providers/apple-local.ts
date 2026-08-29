"use client";

import { buildCanderOnDeviceInstructions } from "@/lib/ai/runtime/cander-on-device-instructions";
import {
  generateWithFoundationModels,
  getFoundationModelsAvailability,
} from "@/lib/ai/runtime/native/foundation-models";
import {
  AiRuntimeError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiRuntimeCapabilities,
  type AiRuntimeProvider,
} from "@/lib/ai/runtime/types";
import { getChatStoreSnapshot } from "@/lib/api/chat-store";
import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
import { getActorSnapshot } from "@/lib/session";
import { getWorkspaceCatalogSnapshot } from "@/lib/workspace-catalog";
import { getMembersSnapshot } from "@/lib/workspace-policy";
import { navLabel } from "@/lib/use-main-nav-items";
import type { SpaceId } from "@/lib/types";

function resolveOnDeviceContext(request: AiGenerateRequest) {
  const actorId = getActorSnapshot();
  const member = getMembersSnapshot().find((item) => item.id === actorId);
  const workspace = getWorkspaceCatalogSnapshot().find(
    (item) => item.id === request.workspaceId,
  );
  let projectTitle: string | null = null;
  let spaceLabel: string | null = null;
  if (request.projectId && actorId) {
    try {
      const project = localSpaceEntityStore.getProject(
        { workspaceId: request.workspaceId, actorId },
        request.projectId,
      );
      projectTitle = project?.title ?? null;
      if (project?.space) {
        spaceLabel = navLabel(project.space as SpaceId) ?? project.space;
      }
    } catch {
      // ignore store misses
    }
  }
  if (!spaceLabel && request.projectSpace) {
    spaceLabel =
      navLabel(request.projectSpace as SpaceId) ?? String(request.projectSpace);
  }
  if (!spaceLabel) {
    const thread = getChatStoreSnapshot().threads.find(
      (item) =>
        item.aiChatId === request.aiChatId || item.id === request.aiChatId,
    );
    if (thread?.spaceId) {
      spaceLabel = navLabel(thread.spaceId) ?? thread.spaceId;
    }
  }
  return {
    shortName: member?.short || member?.name?.split(/\s+/)[0] || null,
    workspaceName: workspace?.name ?? null,
    projectTitle,
    spaceLabel,
  };
}

/**
 * Apple on-device provider via Capacitor → Foundation Models.
 *
 * PRIVACY: Inference stays on-device. Do not call Edge/ai-chat from this path.
 */
export function createAppleLocalProvider(): AiRuntimeProvider {
  return {
    id: "apple-local",

    async getCapabilities(): Promise<AiRuntimeCapabilities> {
      const avail = await getFoundationModelsAvailability();
      return {
        available: avail.available,
        runtime: "apple-local",
        local: true,
        private: true,
        offline: true,
        streaming: avail.streaming,
        tools: false,
        structuredOutput: false,
      };
    },

    async isAvailable() {
      const avail = await getFoundationModelsAvailability();
      return avail.available;
    },

    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const avail = await getFoundationModelsAvailability();
      if (!avail.available) {
        throw new AiRuntimeError(
          "local_unavailable",
          avail.message ||
            "On-device Apple AI is not available. LOCAL will not send this request to the cloud.",
        );
      }
      try {
        const ctx = resolveOnDeviceContext(request);
        const instructions = buildCanderOnDeviceInstructions(ctx);
        // On-device only — never route this prompt through Edge.
        const content = await generateWithFoundationModels(
          request.content,
          instructions,
        );
        return {
          content,
          runtime: "apple-local",
          offline: false,
          condensationOccurred: false,
          aiChatId: request.aiChatId ?? null,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "On-device generation failed.";
        throw new AiRuntimeError("generation_failed", message);
      }
    },
  };
}
