/**
 * Deterministic safeguards — assist the agent, do not replace reasoning.
 */

import {
  prefersBrowserMetadataOnly,
  prefersViewportCapture,
  refersToActiveBrowserSurface,
  refersToPageSelection,
} from "../../browser-context/routing.ts";
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
  if (refersToActiveBrowserSurface(t)) return true;
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

  if (refersToActiveBrowserSurface(content)) {
    if (refersToPageSelection(content)) {
      return [
        {
          name: "browser.current.get_selection",
          arguments: {},
          reason: "active_browser_selection",
        },
      ];
    }
    if (prefersBrowserMetadataOnly(content)) {
      return [
        {
          name: "browser.current.get_metadata",
          arguments: {},
          reason: "active_browser_metadata",
        },
      ];
    }
    if (prefersViewportCapture(content)) {
      return [
        {
          name: "browser.current.capture_viewport",
          arguments: {},
          reason: "active_browser_visual",
        },
        {
          name: "browser.current.get_context",
          arguments: { includeScreenshot: false },
          reason: "active_browser_context_with_visual",
        },
      ];
    }
    return [
      {
        name: "browser.current.get_context",
        arguments: {},
        reason: "active_browser_surface_reference",
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
