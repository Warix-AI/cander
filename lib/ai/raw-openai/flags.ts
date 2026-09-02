/**
 * OpenAI chat mode — default ON for all signed-in users.
 * Opt out with RAW_OPENAI_MODE=0 or NEXT_PUBLIC_RAW_OPENAI_MODE=0.
 * API key is NEVER read here — only on the server route.
 */

function readEnvFlag(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return null;
}

/** Client: OpenAI is the default chat provider. */
export function isRawOpenAIModeEnabled(): boolean {
  const pub = readEnvFlag("NEXT_PUBLIC_RAW_OPENAI_MODE");
  if (pub !== null) return pub;
  const raw = readEnvFlag("RAW_OPENAI_MODE");
  if (raw !== null) return raw;

  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:raw-openai-mode");
      if (ls === "0" || ls === "false" || ls === "off") return false;
      if (ls === "1" || ls === "true" || ls === "on") return true;
    } catch {
      /* ignore */
    }
  }

  return true;
}

/** Server: allow OpenAI API routes unless explicitly disabled. */
export function isRawOpenAIModeAllowedOnServer(): boolean {
  const raw = readEnvFlag("RAW_OPENAI_MODE");
  if (raw !== null) return raw;
  const pub = readEnvFlag("NEXT_PUBLIC_RAW_OPENAI_MODE");
  if (pub !== null) return pub;
  return true;
}
