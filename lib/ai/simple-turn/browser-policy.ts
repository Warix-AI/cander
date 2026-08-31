/**
 * Browser mode policy for WEB lookups.
 */

import type { BrowserMode, Lookup, Plan } from "./types.ts";

const EXPLICIT_WEB =
  /\b(search|look\s*up|google|browse|visit|open|check out|look at|review|fetch|web)\b/i;

export function resolveBrowserMode(opts?: {
  preferred?: BrowserMode;
  hostingMode?: string | null;
}): BrowserMode {
  if (opts?.preferred) return opts.preferred;
  // v1: always auto — PLAN decision stands unless policy blocks.
  return "auto";
}

export function allowWebLookup(opts: {
  browser: BrowserMode;
  userText: string;
  look: Lookup;
}): boolean {
  if (opts.look.cap !== "WEB") return true;
  if (opts.browser === "on") return true;
  if (opts.browser === "auto") return true;
  // browser=off: only when user explicitly requested search/browse
  return EXPLICIT_WEB.test(opts.userText);
}

export function browserRequiresWeb(opts: {
  browser: BrowserMode;
  plan: Plan;
  userText: string;
}): boolean {
  if (opts.browser !== "on") return false;
  if (!opts.plan.fresh && !/\b(news|today|current|live|weather|score)\b/i.test(opts.userText)) {
    return false;
  }
  return true;
}

export function filterLookupsByBrowser(
  lookups: Lookup[],
  browser: BrowserMode,
  userText: string,
): Lookup[] {
  return lookups.filter((look) => allowWebLookup({ browser, userText, look }));
}
