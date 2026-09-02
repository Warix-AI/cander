"use client";

import type {
  AiGenerateRequest,
  AiGenerateResult,
  AiRuntimeCapabilities,
  AiRuntimeMode,
  AiRuntimeProvider,
} from "@/lib/ai/runtime/types";

let openai: AiRuntimeProvider | null = null;

function openaiProvider(): AiRuntimeProvider {
  return (openai ??= {
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
        vision: true,
      };
    },

    async isAvailable() {
      return true;
    },

    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const { runRawOpenAITurn } = await import("@/lib/ai/raw-openai/run-turn");
      return runRawOpenAITurn(request);
    },
  });
}

/** OpenAI is the only inference provider. */
export async function resolveProvider(
  _mode?: AiRuntimeMode,
  _preferredRoute?: AiGenerateRequest["preferredRoute"],
): Promise<AiRuntimeProvider> {
  return openaiProvider();
}

export async function getAiRuntimeCapabilities(
  _mode?: AiRuntimeMode,
): Promise<AiRuntimeCapabilities> {
  return openaiProvider().getCapabilities();
}

export async function generateWithAiRuntime(
  request: AiGenerateRequest,
  _mode?: AiRuntimeMode,
): Promise<AiGenerateResult> {
  return openaiProvider().generate(request);
}
