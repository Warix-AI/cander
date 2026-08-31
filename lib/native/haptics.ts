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
};

function getCapHaptics(): CapHaptics | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { Haptics?: CapHaptics } };
    }
  ).Capacitor;
  return cap?.Plugins?.Haptics ?? null;
}

export function createNativeHaptics(): NativeHaptics {
  return {
    impact(event) {
      try {
        const caps = getDeviceCapabilities();
        if (caps.platform !== "ios" && caps.platform !== "android") return;
        const H = getCapHaptics();
        if (!H) return;
        if (event === "select" && H.selectionStart) {
          void H.selectionStart().catch(() => {});
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
          void H.impact({
            style: event === "send" ? "LIGHT" : "MEDIUM",
          }).catch(() => {});
        }
      } catch {
        // never block
      }
    },
  };
}
