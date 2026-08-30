"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

export type CanderDesktopBridge = {
  platform: string;
  shellBuild?: string;
  shellVersion?: string;
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
    generateStructured?: (opts: {
      prompt: string;
      instructions?: string;
    }) => Promise<{
      content?: string;
      reply?: string;
      toolName?: string;
      toolArguments?: Record<string, unknown>;
      toolArgumentsJson?: string;
      structured?: boolean;
    }>;
  };
  browser?: {
    createTab: (
      tabId: string,
      initialUrl: string,
      options?: Record<string, unknown>,
    ) => Promise<void>;
    destroyTab: (tabId: string) => Promise<void>;
    showTab: (
      tabId: string,
      bounds: { x: number; y: number; width: number; height: number },
    ) => Promise<void>;
    hideTab: (tabId: string) => Promise<void>;
    hideAll?: () => Promise<void>;
    setChromeOverlay?: (active: boolean) => Promise<void>;
    navigate: (tabId: string, url: string) => Promise<void>;
    back: (tabId: string) => Promise<void>;
    forward: (tabId: string) => Promise<void>;
    reload: (tabId: string) => Promise<void>;
    stop: (tabId: string) => Promise<void>;
    onEvent?: (handler: (event: Record<string, unknown>) => void) => () => void;
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

/** True when preload exposes the local browser WebContentsView bridge. */
export function hasDesktopBrowserBridge() {
  const bridge = getCanderDesktopBridge();
  return Boolean(bridge?.browser?.createTab);
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
