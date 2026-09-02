/**
 * Chat runtime path — OpenAI only.
 */

export type AssistantRuntimePath = "openai";

export function resolveAssistantRuntimePath(): AssistantRuntimePath {
  return "openai";
}
