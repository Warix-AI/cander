/** True when the UI is running inside the Cander Electron shell. */
export function isDesktopShell() {
  if (typeof navigator === "undefined") return false;
  return /\bElectron\b/i.test(navigator.userAgent);
}

/**
 * Clearance under macOS traffic lights for the workspace rail + left menu only.
 * Main content stays full-bleed to the top of the window.
 */
export const DESKTOP_TITLEBAR_PX = 47;

