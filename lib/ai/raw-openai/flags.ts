/**
 * Raw OpenAI benchmark mode — bypasses all Cander AI orchestration.
 *
 * Default ON for the current A/B experiment. Opt out with:
 *   NEXT_PUBLIC_RAW_OPENAI_MODE=0
 *   RAW_OPENAI_MODE=0
 *   or localStorage['cander:raw-openai-mode']='0'
 *
 * API key is NEVER read here — only on the server route.
 */

export function isRawOpenAIModeEnabled(): boolean {
  if (typeof process !== "undefined") {
    const pub = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    if (pub === "0" || pub === "false" || pub === "off") return false;
    if (pub === "1" || pub === "true" || pub === "on") return true;
    const raw = process.env.RAW_OPENAI_MODE;
    if (raw === "0" || raw === "false" || raw === "off") return false;
    if (raw === "1" || raw === "true" || raw === "on") return true;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:raw-openai-mode");
      if (ls === "0" || ls === "false" || ls === "off") return false;
      if (ls === "1" || ls === "true" || ls === "on") return true;
    } catch {
      /* ignore */
    }
  }
  // Default ON — raw OpenAI is the active experiment path.
  return true;
}

/** Server-side: allow OpenAI call unless explicitly disabled. */
export function isRawOpenAIModeAllowedOnServer(): boolean {
  const a = process.env.RAW_OPENAI_MODE;
  const b = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
  if (a === "0" || a === "false" || a === "off") return false;
  if (b === "0" || b === "false" || b === "off") return false;
  return true;
}
