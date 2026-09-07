/**
 * NativeHaptics — optional; failure must never block send.
 */

import type { HapticEvent } from "./types.ts";
import { getDeviceCapabilities } from "./device.ts";

export type NativeHaptics = {
  impact(event: HapticEvent): void;
};

type CapHaptics = {
  impact?: (opts: { style: string }) => Promise<void>;
  notification?: (opts: { type: string }) => Promise<void>;
  selectionStart?: () => Promise<void>;
  selectionChanged?: () => Promise<void>;
};

type CapBridge = {
  registerPlugin?: <T>(name: string) => T;
  Plugins?: { Haptics?: CapHaptics };
};

function getCapacitor(): CapBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapBridge }).Capacitor;
}

function getCapHaptics(): CapHaptics | null {
  const cap = getCapacitor();
  if (!cap) return null;
  const existing = cap.Plugins?.Haptics;
  if (existing) return existing;
  // Capacitor 3+ often needs registerPlugin (same pattern as Camera).
  if (typeof cap.registerPlugin === "function") {
    try {
      return cap.registerPlugin<CapHaptics>("Haptics");
    } catch {
      return null;
    }
  }
  return null;
}

function impactStyle(event: HapticEvent): string {
  if (event === "send" || event === "navigation" || event === "select") {
    return "LIGHT";
  }
  return "MEDIUM";
}

export function createNativeHaptics(): NativeHaptics {
  return {
    impact(event) {
      try {
        const caps = getDeviceCapabilities();
        if (caps.platform !== "ios" && caps.platform !== "android") return;
        const H = getCapHaptics();
        if (!H) return;
        if (
          (event === "select" || event === "navigation") &&
          (H.selectionChanged || H.selectionStart)
        ) {
          void (H.selectionChanged ?? H.selectionStart)!().catch(() => {});
          return;
        }
        if (event === "warning" || event === "success") {
          if (H.notification) {
            void H.notification({
              type: event === "warning" ? "WARNING" : "SUCCESS",
            }).catch(() => {});
            return;
          }
        }
        if (H.impact) {
          void H.impact({ style: impactStyle(event) }).catch(() => {});
        }
      } catch {
        // never block
      }
    },
  };
}
