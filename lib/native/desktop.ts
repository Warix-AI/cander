/**
 * NativeDesktopShell — Electron-only shortcut / tray / capture.
 */

import {
  isDesktopQuickAskEnabled,
  isDesktopTrayEnabled,
} from "./flags.ts";
import { getDeviceCapabilities } from "./device.ts";
import type {
  AvailabilityResult,
  CapImagePickResult,
  ScreenCaptureTarget,
} from "./types.ts";

export type NativeDesktopShell = {
  availability(): {
    screenCapture: AvailabilityResult;
    globalShortcut: AvailabilityResult;
    tray: AvailabilityResult;
    quickAsk: AvailabilityResult;
  };
  capture(target: ScreenCaptureTarget): Promise<CapImagePickResult>;
  openQuickAsk?(): Promise<{ ok: boolean }>;
  showMainWindow?(): Promise<{ ok: boolean }>;
};

type DesktopShellBridge = {
  captureScreen?: (opts: {
    target: ScreenCaptureTarget;
  }) => Promise<{
    ok: boolean;
    cancelled?: boolean;
    message?: string;
    dataUrl?: string;
    mime?: string;
    name?: string;
  }>;
  openQuickAsk?: () => Promise<{ ok: boolean }>;
  showMainWindow?: () => Promise<{ ok: boolean }>;
};

function getBridge(): DesktopShellBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (
    window as Window & {
      canderDesktop?: { shell?: DesktopShellBridge };
    }
  ).canderDesktop;
  return bridge?.shell ?? null;
}

export function createNativeDesktopShell(): NativeDesktopShell | undefined {
  const caps = getDeviceCapabilities();
  if (caps.platform !== "electron") return undefined;

  return {
    availability() {
      const d = getDeviceCapabilities();
      return {
        screenCapture: d.screenCapture,
        globalShortcut: isDesktopQuickAskEnabled()
          ? { available: true }
          : {
              available: false,
              reason: "feature_disabled" as const,
              message: "Quick Ask is not enabled in this build.",
            },
        tray: isDesktopTrayEnabled()
          ? { available: true }
          : {
              available: false,
              reason: "feature_disabled" as const,
            },
        quickAsk: isDesktopQuickAskEnabled()
          ? { available: true }
          : {
              available: false,
              reason: "feature_disabled" as const,
            },
      };
    },

    async capture(target) {
      const bridge = getBridge();
      if (!bridge?.captureScreen) {
        return {
          ok: false,
          message:
            target === "browser_viewport"
              ? "No active browser tab to capture."
              : "Screen capture is not available.",
        };
      }
      const res = await bridge.captureScreen({ target });
      if (res.cancelled) {
        return { ok: false, message: "Cancelled", cancelled: true };
      }
      if (!res.ok || !res.dataUrl) {
        return {
          ok: false,
          message: res.message || "Capture failed",
        };
      }
      return {
        ok: true,
        image: {
          name: res.name || "capture.jpeg",
          url: res.dataUrl,
          mime: res.mime || "image/jpeg",
        },
      };
    },

    async openQuickAsk() {
      const bridge = getBridge();
      if (!bridge?.openQuickAsk || !isDesktopQuickAskEnabled()) {
        return { ok: false };
      }
      return bridge.openQuickAsk();
    },

    async showMainWindow() {
      const bridge = getBridge();
      if (!bridge?.showMainWindow) return { ok: false };
      return bridge.showMainWindow();
    },
  };
}
