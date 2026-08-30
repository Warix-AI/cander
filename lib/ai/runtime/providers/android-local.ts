"use client";

import {
  AiRuntimeError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiRuntimeCapabilities,
  type AiRuntimeProvider,
} from "@/lib/ai/runtime/types";

/**
 * Android on-device provider boundary only — no fake native behavior.
 * Future: Capacitor → Kotlin → on-device AI APIs.
 */
export function createAndroidLocalProvider(): AiRuntimeProvider {
  return {
    id: "android-local",

    async getCapabilities(): Promise<AiRuntimeCapabilities> {
      return {
        available: false,
        runtime: "android-local",
        local: true,
        private: true,
        offline: true,
        streaming: false,
        tools: false,
        structuredOutput: false,
      };
    },

    async isAvailable() {
      return false;
    },

    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      if (request.images?.length) {
        throw new AiRuntimeError(
          "vision_requires_cloud",
          "On-device Android AI can't view images yet. Switch to Auto or Cloud to analyze photos.",
        );
      }
      throw new AiRuntimeError(
        "local_unavailable",
        "On-device Android AI is not implemented yet.",
      );
    },
  };
}
