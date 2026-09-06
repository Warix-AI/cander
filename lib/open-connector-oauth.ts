"use client";

import {
  closeOAuthBrowser,
  isMobileShell,
  onOAuthBrowserFinished,
  openOAuthAuthorizationUrl,
} from "@/lib/mobile-shell";
import { getCanderDesktopBridge, isDesktopShell } from "@/lib/desktop-shell";

export type OpenConnectorAuthResult = {
  /** True when Cander stayed put and auth continues in another browser. */
  openedExternally: boolean;
};

type DesktopShellWithExternal = {
  openExternal?: (url: string) => Promise<void> | void;
};

/**
 * True in shells where Composio's nested OAuth popup cannot work
 * (Cursor IDE webview, Capacitor, foreign Electron without Cander preload).
 */
export function needsExternalOAuthBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (isMobileShell()) return true;
  if (/\bCursor\//i.test(navigator.userAgent)) return true;
  if (isDesktopShell() && !getCanderDesktopBridge()) return true;
  return false;
}

/** Open a blank popup while we still have the user-gesture (before await). */
export function reserveOAuthWindow(): Window | null {
  if (typeof window === "undefined") return null;
  if (needsExternalOAuthBrowser()) return null;
  try {
    return window.open(
      "about:blank",
      "cander-oauth",
      "popup=yes,width=560,height=780",
    );
  } catch {
    return null;
  }
}

/**
 * Start Composio Connect Link in the best available surface.
 * Connect Link opens provider OAuth (Stripe, etc.) via window.open — that
 * fails inside Capacitor / Cursor Electron, so those shells use an external
 * browser and leave Cander on the connectors screen.
 */
export function openConnectorAuthorizationUrl(
  authorizationUrl: string,
  opts?: { reserved?: Window | null; onExternalFinished?: () => void },
): OpenConnectorAuthResult {
  if (typeof window === "undefined") {
    return { openedExternally: false };
  }

  const mobile = isMobileShell();
  const constrained = needsExternalOAuthBrowser();
  const deskShell = getCanderDesktopBridge()?.shell as
    | DesktopShellWithExternal
    | undefined;

  if (mobile || constrained) {
    opts?.reserved?.close();
    if (mobile && opts?.onExternalFinished) {
      const stop = onOAuthBrowserFinished(() => {
        stop();
        opts.onExternalFinished?.();
      });
    }
    void openOAuthAuthorizationUrl(authorizationUrl);
    return { openedExternally: true };
  }

  if (typeof deskShell?.openExternal === "function") {
    void deskShell.openExternal(authorizationUrl);
    opts?.reserved?.close();
    return { openedExternally: true };
  }

  if (opts?.reserved && !opts.reserved.closed) {
    opts.reserved.location.href = authorizationUrl;
    return { openedExternally: false };
  }

  window.location.assign(authorizationUrl);
  return { openedExternally: false };
}

export { closeOAuthBrowser };
