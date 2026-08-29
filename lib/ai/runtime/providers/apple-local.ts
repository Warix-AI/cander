"use client";

import {
  buildDialoguePrompt,
  hasPriorConversationTurns,
} from "@/lib/ai/assistant-behavior";
import { buildPlanCapabilityLine } from "@/lib/ai/plan-capability";
import { buildCanderOnDeviceInstructions } from "@/lib/ai/runtime/cander-on-device-instructions";
import {
  ensureOnDeviceIdentity,
  getOnDeviceWorkspaceSnapshot,
  refreshOnDeviceInventoryCache,
} from "@/lib/ai/runtime/on-device-workspace-cache";
import { formatToolsForPrompt } from "@/lib/ai/runtime/tools";
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
import { getActorSnapshot } from "@/lib/session";
import { getMembersSnapshot } from "@/lib/workspace-policy";

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
        tools: true,
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
        const [identity] = await Promise.all([
          ensureOnDeviceIdentity(),
          refreshOnDeviceInventoryCache(request.workspaceId),
        ]);
        const priorTurns = hasPriorConversationTurns(request.messages);
        const snap = getOnDeviceWorkspaceSnapshot({
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          projectSpace: request.projectSpace,
          aiChatId: request.aiChatId,
          threadId: request.threadId,
          currentContent: request.content,
        });
        const toolBlock = formatToolsForPrompt();
        const actorId = getActorSnapshot();
        const member =
          getMembersSnapshot().find((m) => m.id === actorId) ??
          getMembersSnapshot()[0];
        const instructions = [
          buildCanderOnDeviceInstructions({
            shortName: identity?.shortName ?? snap.shortName,
            fullName: identity?.fullName ?? snap.fullName,
            email: identity?.email ?? snap.email,
            workspaceName: snap.workspaceName,
            projectTitle: snap.projectTitle,
            spaceLabel: snap.spaceLabel,
            inventoryBlock: snap.inventoryBlock,
            transcriptBlock: priorTurns ? null : snap.transcriptBlock,
            planCapabilityLine: buildPlanCapabilityLine(member),
            hasPriorTurns: priorTurns,
          }),
          toolBlock,
        ]
          .filter(Boolean)
          .join("\n\n");
        const prompt = buildDialoguePrompt(request.messages, request.content);
        const content = await generateWithFoundationModels(
          prompt,
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
