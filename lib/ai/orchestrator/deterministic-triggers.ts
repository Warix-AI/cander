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
import { wantsAutonomousResearch } from "../web-research/index.ts";

export type QueuedToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  reason: string;
};

/** Explicit deep-research / compare / verify phrasing (Search deep modes — not Agent). */
export function wantsDeepResearch(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return (
    /\b(deep\s+research|research\s+(this|that|whether|if|how)|thorough\s+(look|research|comparison))\b/i.test(
      t,
    ) ||
    /\b(compare|verify|fact[- ]?check|multi[- ]source)\b[\s\S]{0,60}\b(sources?|web|online|internet|sites?)\b/i.test(
      t,
    ) ||
    /\b(compare|vs\.?|versus)\b.+\b(and|vs\.?|versus)\b/i.test(t)
  );
}

/** User turn likely needs live/external evidence before answering. */
export function requiresExternalEvidence(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (extractRequestedUrl(t)) return true;
  if (liveInfoHint(t)) return true;
  if (refersToActiveBrowserSurface(t)) return true;
  if (wantsDeepResearch(t)) return true;
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
        name: browseIntent ? "computer.browser.open" : "web.read",
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

  if (wantsAutonomousResearch(content)) {
    const query = content.trim();
    return [
      {
        name: "create_work_task",
        arguments: {
          title: query.slice(0, 120) || "Research task",
          goal: query.slice(0, 400),
          kind: "research",
          summary: "Autonomous multi-step research",
        },
        reason: "autonomous_research_intent",
      },
    ];
  }

  if (wantsDeepResearch(content)) {
    const query = content.trim().slice(0, 400);
    return [
      {
        name: "web.search",
        arguments: { query, deeper: true },
        reason: "deep_research_search_mode",
      },
    ];
  }

  if (
    /\b(search|look\s*up|google|find)\b[\s\S]{0,40}\b(web|online|internet)\b/i.test(
      content,
    )
  ) {
    return [
      {
        name: "web.search",
        arguments: { query: content.trim().slice(0, 400) },
        reason: "explicit_web_search_intent",
      },
    ];
  }

  // Obvious live-info / nutrition / "today" facts: runtime retrieves, FM synthesizes.
  // Do not wait for the model to choose web.search.
  if (liveInfoHint(content)) {
    return [
      {
        name: "web.search",
        arguments: { query: content.trim().slice(0, 400) },
        reason: "live_info_prerun",
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
