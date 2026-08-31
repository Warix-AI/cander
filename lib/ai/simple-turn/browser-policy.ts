/**
 * Browser / Web composer mode: Auto | On | Off.
 */

import type { BrowserMode, Lookup, Plan } from "./types.ts";

const EXPLICIT_WEB =
  /\b(search|look\s*up|google|browse|visit|open|check out|look at|review|fetch|web)\b/i;

export function resolveBrowserMode(opts?: {
  preferred?: BrowserMode;
  hostingMode?: string | null;
}): BrowserMode {
  if (opts?.preferred) return opts.preferred;
  if (typeof process !== "undefined") {
    const env = process.env.NEXT_PUBLIC_CANDER_WEB_MODE?.toLowerCase();
    if (env === "on" || env === "off" || env === "auto") return env;
  }
  if (typeof window !== "undefined") {
    try {
      const ls = window.localStorage?.getItem("cander:web-mode")?.toLowerCase();
      if (ls === "on" || ls === "off" || ls === "auto") return ls;
    } catch {
      /* ignore */
    }
  }
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
  return EXPLICIT_WEB.test(opts.userText);
}

export function browserRequiresWeb(opts: {
  browser: BrowserMode;
  plan: Plan;
  userText: string;
}): boolean {
  if (opts.browser !== "on") return false;
  if (
    !opts.plan.freshnessRequired &&
    !opts.plan.fresh &&
    !/\b(news|today|current|live|weather|score|calories?|price|schedule)\b/i.test(
      opts.userText,
    )
  ) {
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
