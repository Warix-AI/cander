/**
 * Composer speculation (Tier 1 warm-up + Tier 2 no-tool drafts).
 *
 * DEFAULT OFF — predictive pre-Send drafts are parked. Voice dictation is unrelated.
 * Set NEXT_PUBLIC_COMPOSER_SPECULATION=1 to opt in later.
 * Desktop override: localStorage['cander:composer-speculation'] = '0' | '1'
 *
 * Privacy / product: pre-Send processing sends draft composer text to the
 * server for warm/draft endpoints. Needs approval before enablement.
 */

function readEnvFlag(name: string): boolean | null {
  if (typeof process === "undefined") return null;
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return null;
}

/** Speculation pipeline — default off until we turn prediction back on. */
export function isComposerSpeculationEnabled(): boolean {
  const env = readEnvFlag("NEXT_PUBLIC_COMPOSER_SPECULATION");
  if (env !== null) return env;

  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:composer-speculation");
      if (ls === "1" || ls === "true" || ls === "on") return true;
      if (ls === "0" || ls === "false" || ls === "off") return false;
    } catch {
      /* ignore */
    }
  }

  return false;
}
