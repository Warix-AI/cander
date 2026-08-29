"use client";

import { buildCanderOnDeviceInstructions } from "@/lib/ai/runtime/cander-on-device-instructions";
import {
  ensureOnDeviceIdentity,
  getOnDeviceWorkspaceSnapshot,
  refreshOnDeviceInventoryCache,
} from "@/lib/ai/runtime/on-device-workspace-cache";
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

/**
 * Apple on-device provider via Capacitor → Foundation Models.
 *
 * PRIVACY: Inference stays on-device. Do not call Edge/ai-chat from this path.
 * Identity/workspace text is assembled from local caches (and optionally a
 * profiles row for the user’s name) — never used to proxy the chat prompt.
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
        // Prefer cached member/checkpoint; fall back to profiles once if needed.
        // Inventory refresh is metadata-only (not the chat prompt).
        const [identity] = await Promise.all([
          ensureOnDeviceIdentity(),
          refreshOnDeviceInventoryCache(request.workspaceId),
        ]);
        const snap = getOnDeviceWorkspaceSnapshot({
          workspaceId: request.workspaceId,
          projectId: request.projectId,
          projectSpace: request.projectSpace,
          aiChatId: request.aiChatId,
          threadId: request.threadId,
          currentContent: request.content,
        });
        const instructions = buildCanderOnDeviceInstructions({
          shortName: identity?.shortName ?? snap.shortName,
          fullName: identity?.fullName ?? snap.fullName,
          email: identity?.email ?? snap.email,
          workspaceName: snap.workspaceName,
          projectTitle: snap.projectTitle,
          spaceLabel: snap.spaceLabel,
          inventoryBlock: snap.inventoryBlock,
          transcriptBlock: snap.transcriptBlock,
        });
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
