"use client";

import {
  closeOAuthBrowser,
  isMobileShell,
  onOAuthBrowserFinished,
  openOAuthAuthorizationUrl,
} from "@/lib/mobile-shell";
import { getCanderDesktopBridge } from "@/lib/desktop-shell";

export type OpenConnectorAuthResult = {
  /** Always true — connector OAuth never navigates the Cander window away. */
  openedExternally: true;
  mode: "capacitor_browser" | "desktop_external" | "window_open" | "anchor";
};

type DesktopShellWithExternal = {
  openExternal?: (url: string) => Promise<void> | void;
};

/**
 * @deprecated Connector OAuth always opens externally now.
 * Kept for callers that still branch on the old check.
 */
export function needsExternalOAuthBrowser(): boolean {
  return true;
}

/**
 * @deprecated No longer used — Connect Link must not run in a reserved popup
 * (nested provider popups still fail). Kept as a no-op for call-site compatibility.
 */
export function reserveOAuthWindow(): Window | null {
  return null;
}

/**
 * Open a Composio Connect Link / provider OAuth URL outside the Cander surface.
 * Never uses location.assign — that lands on Composio's "wait for popup" page
 * inside Cursor / Capacitor / Electron where nested Stripe popups cannot open.
 */
export function openConnectorAuthorizationUrl(
  authorizationUrl: string,
  opts?: { reserved?: Window | null; onExternalFinished?: () => void },
): OpenConnectorAuthResult {
  opts?.reserved?.close();

  if (typeof window === "undefined") {
    return { openedExternally: true, mode: "anchor" };
  }

  const deskShell = getCanderDesktopBridge()?.shell as
    | DesktopShellWithExternal
    | undefined;

  if (isMobileShell()) {
    if (opts?.onExternalFinished) {
      const stop = onOAuthBrowserFinished(() => {
        stop();
        opts.onExternalFinished?.();
      });
    }
    void openOAuthAuthorizationUrl(authorizationUrl);
    return { openedExternally: true, mode: "capacitor_browser" };
  }

  if (typeof deskShell?.openExternal === "function") {
    void deskShell.openExternal(authorizationUrl);
    return { openedExternally: true, mode: "desktop_external" };
  }

  // Prefer a real window/tab so Composio can open provider OAuth from there.
  try {
    const popup = window.open(
      authorizationUrl,
      "cander-connector-oauth",
      "noopener,noreferrer",
    );
    if (popup) {
      return { openedExternally: true, mode: "window_open" };
    }
  } catch {
    // fall through
  }

  void openOAuthAuthorizationUrl(authorizationUrl);
  return { openedExternally: true, mode: "anchor" };
}

export { closeOAuthBrowser };
