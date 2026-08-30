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
  if (requested?.url) {
    return [
      {
        name: "web.open",
        arguments: { url: requested.url },
        reason: "explicit_url_in_request",
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
