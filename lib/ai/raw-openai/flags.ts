/**
 * Raw OpenAI benchmark mode — bypasses all Cander AI orchestration.
 *
 * Client-readable flag (routing only):
 *   NEXT_PUBLIC_RAW_OPENAI_MODE=1
 *   or localStorage['cander:raw-openai-mode']='1'
 *
 * Server also accepts RAW_OPENAI_MODE=1.
 * API key is NEVER read here — only on the server route.
 */

export function isRawOpenAIModeEnabled(): boolean {
  if (typeof process !== "undefined") {
    const pub = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
    if (pub === "1" || pub === "true" || pub === "on") return true;
    if (pub === "0" || pub === "false" || pub === "off") return false;
    // Server-only alias (API route / Node tests)
    const raw = process.env.RAW_OPENAI_MODE;
    if (raw === "1" || raw === "true" || raw === "on") return true;
    if (raw === "0" || raw === "false" || raw === "off") return false;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:raw-openai-mode");
      if (ls === "1" || ls === "true" || ls === "on") return true;
      if (ls === "0" || ls === "false" || ls === "off") return false;
    } catch {
      /* ignore */
    }
  }
  return false;
}

/** Server-side: is the raw OpenAI endpoint allowed to call OpenAI? */
export function isRawOpenAIModeAllowedOnServer(): boolean {
  const a = process.env.RAW_OPENAI_MODE;
  const b = process.env.NEXT_PUBLIC_RAW_OPENAI_MODE;
  if (a === "0" || a === "false" || a === "off") return false;
  if (b === "0" || b === "false" || b === "off") return false;
  if (a === "1" || a === "true" || a === "on") return true;
  if (b === "1" || b === "true" || b === "on") return true;
  return false;
}
