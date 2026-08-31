"use client";

/**
 * FM generation with optional structured tool-call output from native bridges.
 * Falls back to prompt JSON protocol when structured API is unavailable.
 * Phase 3: session reuse + streaming deltas when bridge supports them.
 */

import { parseToolCallFromContent } from "@/lib/ai/tool-protocol";
import {
  generateStreamWithFoundationModels,
  generateStructuredWithFoundationModels,
  generateWithFoundationModels,
  getFoundationModelsAvailability,
  hasStructuredFoundationModelsBridge,
} from "@/lib/ai/runtime/native/foundation-models";

export type FmToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type FmGenerateResult = {
  text: string;
  toolCall: FmToolCall | null;
  structured: boolean;
  streamed: boolean;
};

export async function supportsFmStructuredOutput(): Promise<boolean> {
  const avail = await getFoundationModelsAvailability();
  if (!avail.available) return false;
  return hasStructuredFoundationModelsBridge();
}

export async function generateFmTurn(opts: {
  prompt: string;
  instructions?: string;
  sessionId?: string;
  onDelta?: (partial: string) => void;
  preferStream?: boolean;
}): Promise<FmGenerateResult> {
  const structured = await generateStructuredWithFoundationModels(
    opts.prompt,
    opts.instructions,
    opts.sessionId,
  );
  if (structured) {
    if (structured.toolName) {
      opts.onDelta?.(structured.reply);
      return {
        text: structured.reply,
        toolCall: {
          name: structured.toolName,
          arguments: structured.toolArguments ?? {},
        },
        structured: true,
        streamed: Boolean(opts.onDelta),
      };
    }
    opts.onDelta?.(structured.reply);
    return {
      text: structured.reply,
      toolCall: null,
      structured: structured.structured,
      streamed: Boolean(opts.onDelta),
    };
  }

  const useStream = Boolean(opts.preferStream && opts.onDelta);
  const raw = useStream
    ? await generateStreamWithFoundationModels({
        prompt: opts.prompt,
        instructions: opts.instructions,
        sessionId: opts.sessionId,
        onDelta: opts.onDelta!,
      })
    : await generateWithFoundationModels(
        opts.prompt,
        opts.instructions,
        opts.sessionId,
      );
  if (!useStream) opts.onDelta?.(raw);
  const { text, call } = parseToolCallFromContent(raw);
  return {
    text: text || raw,
    toolCall: call ? { name: call.name, arguments: call.arguments } : null,
    structured: false,
    streamed: useStream || Boolean(opts.onDelta),
  };
}
