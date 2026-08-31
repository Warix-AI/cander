/**
 * Search-decision routing — LOCAL vs WEB before tools run.
 * No self-reported numeric confidence; guided enum only.
 */

import type { BrowserMode, HydrateResult } from "./types.ts";

export type KnowledgeRoute = "LOCAL" | "WEB_REQUIRED" | "UNCERTAIN";

export type SplitDecision = "single_query" | "multiple_queries";

const PURE_MATH_RE =
  /^(what(?:'s| is)|calculate|compute|solve)?\s*[\d\s.+\-*/()^=%]+(\s*\??)?$/i;
const MATH_WORD_RE =
  /\b(what is|what's)\s+\d[\d\s.+\-*/^%()]+\s*(equal|equals)?\s*\??$/i;
const DETERMINISTIC_LOGIC_RE =
  /\b(convert|how many (inches|feet|meters|cm|mm|seconds|minutes) in)\b/i;

const CURRENT_FACT_RE =
  /\b(today|tonight|this year|this season|current|latest|live|now|breaking|right now|202[4-9]|203\d)\b/i;
const SCHEDULE_PRICE_NEWS_RE =
  /\b(schedule|kickoff|game|match|score|scores|weather|stock|price|prices|cost|news|headline|menu|menus|calories?|nutrition|product spec|specs?|release date|when does|when is|who (do|does|plays)|play utah|start date|semester)\b/i;
const OBSCURE_LOOKUP_RE =
  /\b(who (is|was|invented)|what is the (capital|population|ceo|founder)|where (is|was)|look ?up|search for|find (out|me)|google)\b/i;
const STABLE_COMMON_RE =
  /\b(capital of|how many (days|hours|weeks|months) in|colors? of the rainbow|definition of|synonym for|spell|meaning of)\b/i;
const EXPLICIT_WEB_RE =
  /\b(search|look\s*up|google|browse|visit|open (the )?web|check (the )?web|online)\b/i;

export function classifyKnowledgeRoute(
  userText: string,
  hydrate?: Pick<HydrateResult, "urls" | "year">,
): KnowledgeRoute {
  const text = userText.trim();
  if (!text) return "LOCAL";

  if (hydrate?.urls?.length) return "WEB_REQUIRED";

  if (
    PURE_MATH_RE.test(text) ||
    MATH_WORD_RE.test(text) ||
    (DETERMINISTIC_LOGIC_RE.test(text) && !CURRENT_FACT_RE.test(text))
  ) {
    return "LOCAL";
  }

  if (CURRENT_FACT_RE.test(text) || SCHEDULE_PRICE_NEWS_RE.test(text)) {
    return "WEB_REQUIRED";
  }

  if (STABLE_COMMON_RE.test(text) && !OBSCURE_LOOKUP_RE.test(text)) {
    return "LOCAL";
  }

  if (OBSCURE_LOOKUP_RE.test(text) || /\b(who|what|when|where|which)\b/i.test(text)) {
    return "UNCERTAIN";
  }

  return "UNCERTAIN";
}

/**
 * Apply composer Web: Auto | On | Off override.
 * - Auto: keep route
 * - On: force WEB_REQUIRED for factual / non-pure-local asks
 * - Off: block web unless user explicitly asks to browse/search
 */
export function applyWebModeOverride(opts: {
  route: KnowledgeRoute;
  browser: BrowserMode;
  userText: string;
}): { route: KnowledgeRoute; allowWeb: boolean; reason: string } {
  const { route, browser, userText } = opts;

  if (browser === "off") {
    if (EXPLICIT_WEB_RE.test(userText)) {
      return {
        route: route === "LOCAL" ? "UNCERTAIN" : route,
        allowWeb: true,
        reason: "web_off_but_explicit_browse",
      };
    }
    return {
      route: "LOCAL",
      allowWeb: false,
      reason: "web_off",
    };
  }

  if (browser === "on") {
    if (route === "LOCAL") {
      // Force web for factual-looking asks; keep pure math local
      if (
        PURE_MATH_RE.test(userText.trim()) ||
        MATH_WORD_RE.test(userText.trim())
      ) {
        return { route: "LOCAL", allowWeb: false, reason: "web_on_pure_math" };
      }
      return {
        route: "WEB_REQUIRED",
        allowWeb: true,
        reason: "web_on_force_factual",
      };
    }
    return {
      route: "WEB_REQUIRED",
      allowWeb: true,
      reason: "web_on",
    };
  }

  // Auto
  if (route === "LOCAL") {
    return { route: "LOCAL", allowWeb: false, reason: "auto_local" };
  }
  return {
    route,
    allowWeb: true,
    reason: route === "WEB_REQUIRED" ? "auto_web_required" : "auto_uncertain",
  };
}

export function routeNeedsExaDeep(route: KnowledgeRoute, allowWeb: boolean): boolean {
  if (!allowWeb) return false;
  return route === "WEB_REQUIRED" || route === "UNCERTAIN";
}
