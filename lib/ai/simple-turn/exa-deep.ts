/**
 * Exa Deep retrieval logging + light answer formatting for simple-turn.
 * Architecture: FM understands → Exa type=deep answers web → Candor verifies.
 */

export const EXA_SEARCH_TYPE = "deep" as const;

export type ExaDeepLogEvent = {
  stage: "request" | "response" | "validation" | "retry" | "final";
  normalizedQuery?: string;
  /** Always "deep" for normal chat web search. */
  exaType?: typeof EXA_SEARCH_TYPE;
  rawExaResponse?: string;
  citations?: Array<{ title?: string; url?: string | null }>;
  validationResult?: string;
  retryQuery?: string;
  finalText?: string;
  intentId?: string;
  ok?: boolean;
};

export function logExaDeep(event: ExaDeepLogEvent): void {
  console.log("[EXA_DEEP]", {
    exaType: EXA_SEARCH_TYPE,
    ...event,
    rawExaResponse: event.rawExaResponse?.slice(0, 2000),
    finalText: event.finalText?.slice(0, 2000),
  });
}

/** Strip tool-wrapper prose; keep Exa's grounded text. */
export function lightFormatExaText(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^Grounded retrieval answer for[^\n]*:\s*/i, "");
  t = t.replace(
    /\n+Use this grounded answer[\s\S]*$/i,
    "",
  );
  t = t.replace(/^Web results for[^\n]*:\s*/i, "");
  return t.trim();
}

/** Build user-facing answer from validated Exa evidence — no FM rewrite. */
export function formatExaPassthroughAnswer(
  items: Array<{ content: string; title?: string; intentId?: string }>,
): string {
  const parts = items
    .map((i) => lightFormatExaText(i.content))
    .filter((t) => t.length >= 8);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 4000);
  return parts.join("\n\n").slice(0, 4000);
}
