/**
 * Pure routing decision for runAssistantTurnInner — no imports of V6/OpenAI.
 */

import { isRawOpenAIModeEnabled } from "./flags.ts";
import { isV6RuntimeEnabled } from "../orchestrator/flags.ts";

export type AssistantRuntimePath = "raw_openai" | "v6" | "legacy";

export function resolveAssistantRuntimePath(): AssistantRuntimePath {
  if (isRawOpenAIModeEnabled()) return "raw_openai";
  if (isV6RuntimeEnabled()) return "v6";
  return "legacy";
}
