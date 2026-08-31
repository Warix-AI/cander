/**
 * Feature flags + env helpers for web research (Edge).
 * Secrets must never be NEXT_PUBLIC_ or logged.
 */

export type WebResearchProviderFlag = "exa" | "brave";

/** Temporary: prefer Exa deep retrieval for open-web factual asks. */
export type WebRetrievalModeFlag = "deep_default" | "fast" | "auto";

export function webResearchEnabled(): boolean {
  const v = (Deno.env.get("WEB_RESEARCH_ENABLED") ?? "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function webResearchProvider(): WebResearchProviderFlag {
  const v = (Deno.env.get("WEB_RESEARCH_PROVIDER") ?? "exa").toLowerCase();
  return v === "brave" ? "brave" : "exa";
}

/**
 * Open-web retrieval depth policy.
 * Default `deep_default` — correctness over latency while INTERPRET matures.
 * Set WEB_RETRIEVAL_MODE=fast|auto to benchmark lighter Exa modes later.
 */
export function webRetrievalMode(): WebRetrievalModeFlag {
  const v = (Deno.env.get("WEB_RETRIEVAL_MODE") ?? "deep_default").toLowerCase();
  if (v === "fast" || v === "instant") return "fast";
  if (v === "auto") return "auto";
  return "deep_default";
}

export function exaDeepSearchEnabled(): boolean {
  const v = (Deno.env.get("EXA_DEEP_SEARCH_ENABLED") ?? "false").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function webOpenDirectFetchEnabled(): boolean {
  // When true: direct HTTP fetch only (no Exa Contents fallback inside web-open).
  // Direct fetch is always attempted first for explicit URL opens.
  const v = (
    Deno.env.get("WEB_OPEN_DIRECT_FETCH_ENABLED") ?? "false"
  ).toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

export function exaApiKey(): string {
  return Deno.env.get("EXA_API_KEY") ?? "";
}

export function braveApiKey(): string {
  return Deno.env.get("BRAVE_SEARCH_API_KEY") ?? "";
}
