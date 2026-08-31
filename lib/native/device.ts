/**
 * Resolve DeviceCapabilities from the current host — compiler input only.
 */

import { isDesktopShell } from "../desktop-shell.ts";
import { getMobilePlatform, isMobileShell } from "../mobile-shell.ts";
import {
  isHealthKitFlagEnabled,
  isDesktopQuickAskEnabled,
  isDesktopTrayEnabled,
} from "./flags.ts";
import type {
  AvailabilityResult,
  DeviceCapabilities,
  NativePlatform,
} from "./types.ts";

function avail(
  available: boolean,
  reason?: AvailabilityResult["reason"],
  message?: string,
): AvailabilityResult {
  return available
    ? { available: true }
    : { available: false, reason, message };
}

export function resolveNativePlatform(): NativePlatform {
  if (isDesktopShell()) return "electron";
  if (isMobileShell()) {
    const p = getMobilePlatform();
    if (p === "ios" || p === "android") return p;
  }
  return "web";
}

export function getDeviceCapabilities(): DeviceCapabilities {
  const platform = resolveNativePlatform();
  const isNative = platform !== "web";
  const isIos = platform === "ios";
  const isElectron = platform === "electron";
  const isCap = platform === "ios" || platform === "android";

  return {
    platform,
    isNative,
    camera: avail(
      isCap,
      isCap ? undefined : "unsupported_platform",
      isCap ? undefined : "Camera is available in the Cander mobile app.",
    ),
    photoLibrary: avail(
      isCap,
      isCap ? undefined : "unsupported_platform",
      isCap ? undefined : "Photo library is available in the Cander mobile app.",
    ),
    files: avail(true),
    share: avail(
      isCap,
      "not_installed",
      "Share into Cander is coming in a later build.",
    ),
    haptics: avail(
      isCap,
      isCap ? undefined : "unsupported_platform",
      isCap ? undefined : "Haptics are available on mobile.",
    ),
    healthKit: avail(
      isIos && isHealthKitFlagEnabled(),
      !isIos
        ? "unsupported_platform"
        : !isHealthKitFlagEnabled()
          ? "feature_disabled"
          : undefined,
      !isIos
        ? "Available on iPhone"
        : !isHealthKitFlagEnabled()
          ? "Apple Health is not enabled in this build."
          : undefined,
    ),
    notifications: avail(false, "not_installed"),
    screenCapture: avail(
      isElectron,
      isElectron ? undefined : "unsupported_platform",
      isElectron
        ? undefined
        : "Screen capture is available on desktop.",
    ),
    globalShortcut: avail(
      isElectron && isDesktopQuickAskEnabled(),
      isElectron ? "feature_disabled" : "unsupported_platform",
    ),
    tray: avail(
      isElectron && isDesktopTrayEnabled(),
      isElectron ? "feature_disabled" : "unsupported_platform",
    ),
    localModel: avail(isIos || isElectron),
    network: avail(true),
  };
}
