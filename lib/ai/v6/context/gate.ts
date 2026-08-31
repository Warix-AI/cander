/**
 * Stage 2 — Context gate (cheap signals before expensive retrieval).
 */

import type { ContextGate, SurfaceExpectation } from "../types.ts";

const MEMORY_TRIGGERS =
  /\b(remember|you\s+know|my\s+(preference|name|company)|saved|note\s+that|always\s+use)\b/i;

const PRIOR_CHAT_TRIGGERS =
  /\b(we\s+talked\s+about|last\s+time|yesterday|that\s+company|the\s+one\s+from\s+before|what\s+did\s+i\s+decide|you\s+remember|earlier\s+(in\s+)?(our|this)\s+chat|prior\s+chat|previous\s+conversation)\b/i;

const KB_TRIGGERS =
  /\b(handbook|our\s+(policy|docs?|documentation|refund|pto)|knowledge\s*base|uploaded|the\s+file|internal)\b/i;

export function contextGate(
  text: string,
  surface: SurfaceExpectation,
  opts?: { entityResolutionFailed?: boolean },
): ContextGate {
  const searchPriorChats =
    surface.signals.hasPriorChatReference ||
    PRIOR_CHAT_TRIGGERS.test(text) ||
    Boolean(opts?.entityResolutionFailed);

  return {
    currentThread: true,
    searchMemory: MEMORY_TRIGGERS.test(text) || searchPriorChats,
    searchPriorChats,
    inspectKnowledgeBaseMetadata:
      surface.signals.hasFileReference || KB_TRIGGERS.test(text),
  };
}
