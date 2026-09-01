/**
 * Foundation Models routing policy.
 *
 * Product default: OFF — all chat synthesis goes through OpenAI (cloud).
 * FM bridges remain in the tree for future re-enable.
 *
 * Opt in locally: NEXT_PUBLIC_FM_ENABLED=1
 */

export function isFoundationModelsEnabled(): boolean {
  if (typeof process !== "undefined") {
    const v = process.env.NEXT_PUBLIC_FM_ENABLED?.trim().toLowerCase();
    if (v === "1" || v === "true" || v === "on") return true;
    if (v === "0" || v === "false" || v === "off") return false;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:fm-enabled");
      if (ls === "1" || ls === "true" || ls === "on") return true;
      if (ls === "0" || ls === "false" || ls === "off") return false;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export const FM_DISABLED_MESSAGE =
  "On-device Foundation Models are disabled. Cander uses OpenAI for answers.";
