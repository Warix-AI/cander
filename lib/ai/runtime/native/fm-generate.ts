"use client";

/**
 * FM generation with optional structured tool-call output from native bridges.
 * Falls back to prompt JSON protocol when structured API is unavailable.
 */

import { parseToolCallFromContent } from "@/lib/ai/tool-protocol";
import {
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
};

export async function supportsFmStructuredOutput(): Promise<boolean> {
  const avail = await getFoundationModelsAvailability();
  if (!avail.available) return false;
  return hasStructuredFoundationModelsBridge();
}

export async function generateFmTurn(opts: {
  prompt: string;
  instructions?: string;
}): Promise<FmGenerateResult> {
  const structured = await generateStructuredWithFoundationModels(
    opts.prompt,
    opts.instructions,
  );
  if (structured) {
    if (structured.toolName) {
      return {
        text: structured.reply,
        toolCall: {
          name: structured.toolName,
          arguments: structured.toolArguments ?? {},
        },
        structured: true,
      };
    }
    return {
      text: structured.reply,
      toolCall: null,
      structured: structured.structured,
    };
  }

  const raw = await generateWithFoundationModels(
    opts.prompt,
    opts.instructions,
  );
  const { text, call } = parseToolCallFromContent(raw);
  return {
    text: text || raw,
    toolCall: call ? { name: call.name, arguments: call.arguments } : null,
    structured: false,
  };
}
