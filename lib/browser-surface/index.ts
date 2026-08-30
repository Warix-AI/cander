"use client";

import { isDesktopShell } from "@/lib/desktop-shell";
import { isCapacitorNative } from "@/lib/composer-attach";
import { createCapacitorBrowserSurfaceAdapter } from "@/lib/browser-surface/capacitor-adapter";
import { createElectronBrowserSurfaceAdapter } from "@/lib/browser-surface/electron-adapter";
import { createWebPwaBrowserSurfaceAdapter } from "@/lib/browser-surface/web-pwa-adapter";
import type { BrowserSurfaceAdapter } from "@/lib/browser-surface/types";

let cached: BrowserSurfaceAdapter | null = null;

/** Pick the platform browser surface for local/preview web tabs. */
export function getBrowserSurfaceAdapter(): BrowserSurfaceAdapter {
  if (cached) {
    return cached;
  }
  if (typeof window !== "undefined" && isDesktopShell()) {
    cached = createElectronBrowserSurfaceAdapter();
    return cached;
  }
  if (typeof window !== "undefined" && isCapacitorNative()) {
    cached = createCapacitorBrowserSurfaceAdapter();
    return cached;
  }
  cached = createWebPwaBrowserSurfaceAdapter();
  return cached;
}

export type {
  BrowserSurfaceAdapter,
  BrowserSurfaceBounds,
  BrowserSurfaceCreateOptions,
  BrowserSurfaceEvent,
} from "@/lib/browser-surface/types";
export { canEmbedInPwa } from "@/lib/browser-surface/local-browsing";
export {
  assertAllowedLocalBrowserUrl,
  isAllowedLocalBrowserUrl,
  localBrowserPartition,
} from "@/lib/browser-surface/local-browsing";
