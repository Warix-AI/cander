/**
 * BrowsingFocus — ambient context from the active right-panel browser / project tab.
 *
 * While the user is viewing a URL (project browser, standalone browser, connector web tab),
 * that page is quietly available to chat. It is NOT an explicit @-reference chip.
 *
 * Rules:
 * - Composer may soften the placeholder ("Message about Google") from the hostname.
 * - The visible user message must not include the URL unless they attached it explicitly.
 * - The model receives metadata + soft instructions: use the page only when the user
 *   is clearly asking about it; otherwise ignore BrowsingFocus entirely.
 */

import {
  getActiveBrowserContextTab,
  subscribeActiveBrowserContextTab,
} from "@/lib/browser-context/active-tab";
import type { ActiveBrowserTab } from "@/lib/browser-context/types";
import { displayHostFromUrl, isHttpUrl } from "@/lib/preview-url";

export type BrowsingFocus = {
  tabId: string;
  title: string;
  url: string;
  /** Friendly site name for UI (e.g. "Google"). */
  label: string;
  domain: string;
  tabKind: ActiveBrowserTab["tabKind"];
  projectId?: string;
};

export function isMeaningfulBrowsingUrl(url: string | null | undefined): boolean {
  const raw = (url || "").trim();
  if (!raw || raw === "about:blank") return false;
  return isHttpUrl(raw);
}

export function browsingFocusLabelFromUrl(url: string, title?: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    const main =
      parts.length >= 2 ? parts[parts.length - 2]! : parts[0] || host;
    if (main) {
      return main.charAt(0).toUpperCase() + main.slice(1);
    }
  } catch {
    /* fall through */
  }
  const fromTitle = title?.trim();
  if (fromTitle) return fromTitle.slice(0, 32);
  return displayHostFromUrl(url) || "this page";
}

export function resolveBrowsingFocus(
  tab: ActiveBrowserTab | null = getActiveBrowserContextTab(),
): BrowsingFocus | null {
  if (!tab || !isMeaningfulBrowsingUrl(tab.url)) return null;
  let domain = tab.url;
  try {
    domain = new URL(tab.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return {
    tabId: tab.tabId,
    title: tab.title || displayHostFromUrl(tab.url) || domain,
    url: tab.url,
    label: browsingFocusLabelFromUrl(tab.url, tab.title),
    domain,
    tabKind: tab.tabKind,
    projectId: tab.projectId,
  };
}

/** Soft composer placeholder while BrowsingFocus is active. */
export function browsingFocusComposerPlaceholder(
  focus: BrowsingFocus | null = resolveBrowsingFocus(),
): string | null {
  if (!focus) return null;
  return `Message about ${focus.label}`;
}

/**
 * Hidden system block for the model. Soft-gated: only lean on the page when
 * the user's message signals page-related intent.
 */
export function browsingFocusSystemBlock(
  focus: BrowsingFocus | null = resolveBrowsingFocus(),
): string {
  if (!focus) return "";
  return [
    "## BrowsingFocus (ambient — optional context)",
    `The user is currently viewing: title=${focus.title}; domain=${focus.domain}; url=${focus.url}; kind=${focus.tabKind}; project=${focus.projectId ?? "none"}.`,
    "This is NOT an explicit attachment. Do not mention the page, domain, or URL unless the user's message clearly refers to this page/site/tab/preview/selection or what they are looking at.",
    "If the message is unrelated general chat or a different task, ignore BrowsingFocus completely — do not tailor the reply to this page.",
    "When the message does refer to this page, use browser.current.get_context (or capture_viewport for visual questions) before saying you cannot see it. Only the selected tab is readable.",
  ].join("\n");
}

export function subscribeBrowsingFocus(listener: () => void) {
  return subscribeActiveBrowserContextTab(listener);
}

export function getBrowsingFocusSnapshot(): BrowsingFocus | null {
  return resolveBrowsingFocus();
}

export function getBrowsingFocusServerSnapshot(): BrowsingFocus | null {
  return null;
}
