"use client";

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
        // On-device only — never route this prompt through Edge.
        const content = await generateWithFoundationModels(request.content);
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
