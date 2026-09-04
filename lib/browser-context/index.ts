"use client";

import { isCapacitorNative } from "@/lib/composer-attach";
import { hasDesktopBrowserBridge, isDesktopShell } from "@/lib/desktop-shell";
import type { BrowserContextProvider } from "@/lib/browser-context/types";
import { createElectronBrowserContextProvider } from "@/lib/browser-context/electron-provider";
import { createCapacitorBrowserContextProvider } from "@/lib/browser-context/capacitor-provider";
import { createWebPwaBrowserContextProvider } from "@/lib/browser-context/web-pwa-provider";

let cached: BrowserContextProvider | null = null;

export function getBrowserContextProvider(): BrowserContextProvider {
  if (cached) return cached;
  if (typeof window !== "undefined" && isDesktopShell() && hasDesktopBrowserBridge()) {
    cached = createElectronBrowserContextProvider();
    return cached;
  }
  if (typeof window !== "undefined" && isCapacitorNative()) {
    cached = createCapacitorBrowserContextProvider();
    return cached;
  }
  cached = createWebPwaBrowserContextProvider();
  return cached;
}

export type {
  ActiveBrowserTab,
  BrowserContextProvider,
  PageContext,
  PageSelection,
  ReadPageOptions,
  ViewportCapture,
} from "@/lib/browser-context/types";
export {
  getActiveBrowserContextTab,
  setActiveBrowserContextTab,
  subscribeActiveBrowserContextTab,
} from "@/lib/browser-context/active-tab";
export {
  isSensitiveBrowserUrl,
  DEFAULT_PAGE_TEXT_LIMIT,
} from "@/lib/browser-context/types";
export {
  isBrowserContextReading,
  setBrowserContextReading,
  subscribeBrowserContextReading,
} from "@/lib/browser-context/reading-indicator";
export {
  refersToActiveBrowserSurface,
  prefersViewportCapture,
  refersToPageSelection,
} from "@/lib/browser-context/routing";
export {
  resolveBrowsingFocus,
  browsingFocusComposerPlaceholder,
  browsingFocusSystemBlock,
  subscribeBrowsingFocus,
  getBrowsingFocusSnapshot,
  getBrowsingFocusServerSnapshot,
  type BrowsingFocus,
} from "@/lib/browser-context/browsing-focus";
