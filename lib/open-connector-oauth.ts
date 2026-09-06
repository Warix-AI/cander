"use client";

import { isMobileShell, openExternalUrl } from "@/lib/mobile-shell";

/**
 * Start Composio Connect Link in the best available surface.
 * Capacitor WebViews often cannot open nested OAuth popups, so use the
 * system browser there. Elsewhere use a full-page redirect (desktop Electron
 * allows auth popups via setWindowOpenHandler).
 */
export function openConnectorAuthorizationUrl(authorizationUrl: string) {
  if (typeof window === "undefined") return;
  if (isMobileShell()) {
    openExternalUrl(authorizationUrl);
    return;
  }
  window.location.assign(authorizationUrl);
}
