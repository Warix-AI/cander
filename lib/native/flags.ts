/**
 * Feature flags for native capability rollout.
 * All default OFF except facade wrap is always available (behavior-identical).
 */

export function isNativeCapabilitiesFlagEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_NATIVE_CAPABILITIES;
  if (v === "0" || v === "false" || v === "off") return false;
  // Facade wrap is safe; default on for adapters. New features still gated.
  return true;
}

export function isHealthKitFlagEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_AI_HEALTHKIT;
  return v === "1" || v === "true" || v === "on";
}

export function isDesktopQuickAskEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DESKTOP_QUICK_ASK;
  return v === "1" || v === "true" || v === "on";
}

export function isDesktopTrayEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DESKTOP_TRAY;
  return v === "1" || v === "true" || v === "on";
}
