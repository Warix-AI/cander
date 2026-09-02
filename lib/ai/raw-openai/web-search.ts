/**
 * OpenAI native web_search for raw Responses API mode.
 * Does not use third-party search providers or Cander web retrieval.
 */

export function isOpenAIWebSearchEnabled(): boolean {
  const v = process.env.OPENAI_WEB_SEARCH?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "on";
}

/** Attach web_search only when the user likely wants live web info. */
export function looksLikeWebSearchIntent(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return /\b(search( the)? web|google|look up|latest|news|current|today|what happened|who is|wikipedia|according to|find online|browse)\b/i.test(
    t,
  );
}

export function resolveOpenAIModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.RAW_OPENAI_MODEL?.trim() ||
    "gpt-5.6-luna"
  );
}

/** Detect whether the Responses API actually invoked web search. */
export function didOpenAIUseWebSearch(
  output: Array<{ type?: string } | null | undefined> | null | undefined,
): boolean {
  if (!Array.isArray(output)) return false;
  return output.some((item) => item?.type === "web_search_call");
}
