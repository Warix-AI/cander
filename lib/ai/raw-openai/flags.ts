/**
 * Raw OpenAI benchmark mode — bypasses all Cander AI orchestration.
 *
 * Default OFF everywhere. Opt in with RAW_OPENAI_MODE=1 or NEXT_PUBLIC_RAW_OPENAI_MODE=1.
 * localStorage override is ignored in production.
 *
 * API key is NEVER read here — only on the server route.
 */

function isProductionRuntime(): boolean {
  if (typeof process === "undefined") return false;
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  return nodeEnv === "production" || vercelEnv === "production";
}

function readEnvFlag(name: string): boolean | null {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return null;
}

export function isRawOpenAIModeEnabled(): boolean {
  const pub = readEnvFlag("NEXT_PUBLIC_RAW_OPENAI_MODE");
  if (pub !== null) return pub;
  const raw = readEnvFlag("RAW_OPENAI_MODE");
  if (raw !== null) return raw;

  if (!isProductionRuntime() && typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:raw-openai-mode");
      if (ls === "0" || ls === "false" || ls === "off") return false;
      if (ls === "1" || ls === "true" || ls === "on") return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

/** Server-side: allow OpenAI call only when explicitly enabled. */
export function isRawOpenAIModeAllowedOnServer(): boolean {
  const raw = readEnvFlag("RAW_OPENAI_MODE");
  if (raw !== null) return raw;
  const pub = readEnvFlag("NEXT_PUBLIC_RAW_OPENAI_MODE");
  if (pub !== null) return pub;
  return false;
}
