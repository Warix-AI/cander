/**
 * Feature flags + env helpers for web research (Edge).
 * Secrets must never be NEXT_PUBLIC_ or logged.
 */

export type WebResearchProviderFlag = "exa" | "brave";

/** Normal chat always uses Exa type=deep; ladder disabled until re-enabled. */
export type WebRetrievalModeFlag =
  | "deep_only"
  | "deep_default"
  | "fast"
  | "auto";

export function webResearchEnabled(): boolean {
  const v = (Deno.env.get("WEB_RESEARCH_ENABLED") ?? "true").toLowerCase();
  return v !== "0" && v !== "false" && v !== "off";
}

export function webResearchProvider(): WebResearchProviderFlag {
  const v = (Deno.env.get("WEB_RESEARCH_PROVIDER") ?? "exa").toLowerCase();
  return v === "brave" ? "brave" : "exa";
}

/**
 * Open-web retrieval depth — always deep_only for normal chat.
 * Env WEB_RETRIEVAL_MODE is ignored until the mode ladder is deliberately re-enabled.
 */
export function webRetrievalMode(): WebRetrievalModeFlag {
  return "deep_only";
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
