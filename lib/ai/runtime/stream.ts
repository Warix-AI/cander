"use client";

import { generateWithAiRuntime } from "@/lib/ai/runtime/runtime";
import type {
  AiGenerateRequest,
  AiGenerateResult,
} from "@/lib/ai/runtime/types";
import { getAiRuntimeMode } from "@/lib/ai/runtime/mode-store";

export type AiStreamHandlers = {
  onDelta?: (text: string) => void;
  onDone?: (result: AiGenerateResult) => void;
  onError?: (message: string) => void;
};

/**
 * Streaming entry for AIRuntime.
 *
 * Native Apple streaming is not exposed through Cap events yet — we generate
 * fully on-device/cloud then optionally typewriter on the client.
 * When Cap emits token deltas, wire them here without changing callers.
 */
export async function streamWithAiRuntime(
  request: AiGenerateRequest,
  handlers: AiStreamHandlers = {},
  mode = getAiRuntimeMode(),
): Promise<AiGenerateResult> {
  try {
    const result = await generateWithAiRuntime(request, mode);
    if (handlers.onDelta && result.content) {
      handlers.onDelta(result.content);
    }
    handlers.onDone?.(result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    handlers.onError?.(message);
    throw err;
  }
}
