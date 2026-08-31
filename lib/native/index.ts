/**
 * Composed NativeCapabilities facade — sources and actions for the
 * shared intelligence layer. Not a god object: modules stay separate.
 */

import { getDeviceCapabilities } from "./device.ts";
import { createNativeDesktopShell } from "./desktop.ts";
import { createNativeFiles } from "./files.ts";
import { createNativeHaptics } from "./haptics.ts";
import { createNativeHealth } from "./health.ts";
import { createNativeKeyboard } from "./keyboard.ts";
import { createNativeMedia } from "./media.ts";
import type { DeviceCapabilities } from "./types.ts";
import type { NativeDesktopShell } from "./desktop.ts";
import type { NativeFiles } from "./files.ts";
import type { NativeHaptics } from "./haptics.ts";
import type { NativeHealth } from "./health.ts";
import type { NativeKeyboard } from "./keyboard.ts";
import type { NativeMedia } from "./media.ts";

export type NativeCapabilities = {
  device: DeviceCapabilities;
  media: NativeMedia;
  files: NativeFiles;
  keyboard: NativeKeyboard;
  haptics: NativeHaptics;
  health?: NativeHealth;
  desktop?: NativeDesktopShell;
};

let cached: NativeCapabilities | null = null;

export function getNativeCapabilities(): NativeCapabilities {
  if (cached) {
    // Refresh device snapshot each call — platform/flags can change in tests
    cached = {
      ...cached,
      device: getDeviceCapabilities(),
    };
    return cached;
  }
  cached = {
    device: getDeviceCapabilities(),
    media: createNativeMedia(),
    files: createNativeFiles(),
    keyboard: createNativeKeyboard(),
    haptics: createNativeHaptics(),
    health: createNativeHealth(),
    desktop: createNativeDesktopShell(),
  };
  return cached;
}

/** Test helper — clear singleton. */
export function resetNativeCapabilitiesCache() {
  cached = null;
}

export {
  getDeviceCapabilities,
  resolveNativePlatform,
} from "./device.ts";
export {
  isDesktopQuickAskEnabled,
  isDesktopTrayEnabled,
  isHealthKitFlagEnabled,
  isNativeCapabilitiesFlagEnabled,
} from "./flags.ts";
export {
  normalizePickedFile,
  normalizePickedFiles,
  filesToNativePicked,
} from "./normalize.ts";
export type * from "./types.ts";
