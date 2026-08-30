"use client";

/**
 * Placeholder for future Apple Cloud / Private Cloud Compute inference.
 * Do NOT invent APIs — wire when Apple ships entitlements and SDK surface.
 */

import {
  AiRuntimeError,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiRuntimeCapabilities,
  type AiRuntimeProvider,
} from "@/lib/ai/runtime/types";

const UNAVAILABLE =
  "Apple Cloud inference is not available in this build. Use Auto (on-device) or Cloud (Cander).";

export function createAppleCloudFutureProvider(): AiRuntimeProvider {
  return {
    id: "apple-cloud-future",

    async getCapabilities(): Promise<AiRuntimeCapabilities> {
      return {
        available: false,
        runtime: "apple-cloud-future",
        local: false,
        private: true,
        offline: false,
        streaming: false,
        tools: true,
        structuredOutput: true,
      };
    },

    async isAvailable() {
      return false;
    },

    async generate(_request: AiGenerateRequest): Promise<AiGenerateResult> {
      throw new AiRuntimeError("apple_cloud_unavailable", UNAVAILABLE);
    },
  };
}
