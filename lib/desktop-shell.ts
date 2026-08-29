"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

export type CanderDesktopBridge = {
  platform: string;
  window?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  foundationModels?: {
    getAvailability: () => Promise<{
      available?: boolean;
      reason?: string;
      streaming?: boolean;
      message?: string;
    }>;
    generate: (opts: {
      prompt: string;
      instructions?: string;
    }) => Promise<{ content?: string }>;
  };
};

declare global {
  interface Window {
    canderDesktop?: CanderDesktopBridge;
  }
}

/** True when the UI is running inside the Cander Electron shell. */
export function isDesktopShell() {
  if (typeof navigator === "undefined") return false;
  return /\bElectron\b/i.test(navigator.userAgent);
}

export function getCanderDesktopBridge(): CanderDesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.canderDesktop;
}

/** Electron on macOS with custom frameless traffic lights. */
export function isMacDesktopShell() {
  if (typeof navigator === "undefined") return false;
  const platform = getCanderDesktopBridge()?.platform;
  if (platform === "win32" || platform === "linux") return false;
  const mac =
    platform === "darwin" ||
    /Mac|Macintosh/i.test(`${navigator.platform} ${navigator.userAgent}`);
  if (!mac) return false;
  if (isDesktopShell()) return true;
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("cander-desktop");
}

function subscribeDesktopShell(_onStoreChange: () => void) {
  return () => {};
}

function getDesktopShellSnapshot() {
  return isDesktopShell();
}

function getDesktopShellServerSnapshot() {
  return false;
}

/** Client hook — false on the server / in a normal browser. */
export function useDesktopShell() {
  return useSyncExternalStore(
    subscribeDesktopShell,
    getDesktopShellSnapshot,
    getDesktopShellServerSnapshot,
  );
}

/**
 * Classic Mac titlebar / WindowChrome row height (traffic-light axis).
 * Main content stays full-bleed; only left chrome uses this.
 */
export const DESKTOP_TITLEBAR_PX = 52;

/**
 * Left inset so classic Mac header controls sit just past the traffic lights.
 * x (16) + 3×13px lights + 2×8px gaps + padding (~84px).
 */
export const DESKTOP_TRAFFIC_CLEAR_PX = 84;

/**
 * Inline app-region styles — more reliable in Electron than stylesheet rules
 * for punching through the macOS titlebar hit target.
 */
export const DESKTOP_NO_DRAG = {
  WebkitAppRegion: "no-drag",
} as CSSProperties;

export const DESKTOP_DRAG = {
  WebkitAppRegion: "drag",
} as CSSProperties;
