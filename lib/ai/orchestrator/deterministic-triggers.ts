/**
 * Deterministic safeguards — assist the agent, do not replace reasoning.
 */

import { extractRequestedUrl } from "./web-retrieval.ts";
import { liveInfoHint } from "./v2-helpers.ts";

export type QueuedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  reason: string;
};

/** User turn likely needs live/external evidence before answering. */
export function requiresExternalEvidence(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (extractRequestedUrl(t)) return true;
  if (liveInfoHint(t)) return true;
  if (/\b(search|look\s*up|google|find)\b[\s\S]{0,40}\b(web|online|internet)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Tools to run before the first model call (obvious cases). */
export function initialDeterministicToolCalls(content: string): QueuedToolCall[] {
  const requested = extractRequestedUrl(content.trim());
  const browseIntent =
    /\b(go to|visit|open in browser|browse to|navigate to)\b/i.test(content);

  if (requested?.url) {
    return [
      {
        name: browseIntent ? "computer.browser.open" : "web.open",
        arguments: { url: requested.url },
        reason: browseIntent ? "explicit_browse_intent" : "explicit_url_in_request",
      },
    ];
  }
  return [];
}

export function hostLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
