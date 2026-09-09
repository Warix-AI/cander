/**
 * OpenAI native web_search for raw Responses API mode.
 * Does not use third-party search providers or Cander web retrieval.
 */

export function isOpenAIWebSearchEnabled(): boolean {
  const v = process.env.OPENAI_WEB_SEARCH?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "on";
}

export function resolveOpenAIModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.RAW_OPENAI_MODEL?.trim() ||
    "gpt-5.6-luna"
  );
}

/** Codex / coding model for Build project chat when coding agent is enabled. */
export function resolveOpenAICodingModel(): string {
  return (
    process.env.CODING_AGENT_MODEL?.trim() ||
    process.env.OPENAI_CODING_MODEL?.trim() ||
    "gpt-5.3-codex"
  );
}

/**
 * Prefer Codex for Build project turns when CODING_AGENT_ENABLED is on;
 * otherwise the general chat model.
 */
export function resolveOpenAIModelForTurn(opts?: {
  spaceId?: string | null;
  projectId?: string | null;
}): string {
  const space = opts?.spaceId?.trim().toLowerCase();
  const preferCoding =
    Boolean(opts?.projectId?.trim()) &&
    (space === "build" || space === "create" || space === "studio");
  if (preferCoding) {
    const raw = process.env.CODING_AGENT_ENABLED?.trim().toLowerCase();
    if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
      return resolveOpenAICodingModel();
    }
  }
  return resolveOpenAIModel();
}

/** Detect whether the Responses API actually invoked web search. */
export function didOpenAIUseWebSearch(
  output: Array<{ type?: string } | null | undefined> | null | undefined,
): boolean {
  if (!Array.isArray(output)) return false;
  return output.some((item) => item?.type === "web_search_call");
}
