/** True when the UI is running inside the Cander Electron shell. */
export function isDesktopShell() {
  if (typeof navigator === "undefined") return false;
  return /\bElectron\b/i.test(navigator.userAgent);
}

/** macOS hiddenInset traffic-light clearance. */
export const DESKTOP_TITLEBAR_PX = 44;
