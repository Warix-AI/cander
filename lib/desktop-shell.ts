"use client";

import { useEffect, useState } from "react";

/** True when the UI is running inside the Cander Electron shell. */
export function isDesktopShell() {
  if (typeof navigator === "undefined") return false;
  return /\bElectron\b/i.test(navigator.userAgent);
}

/** Client hook — false on the server / in a normal browser. */
export function useDesktopShell() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(isDesktopShell());
  }, []);
  return desktop;
}

/**
 * Clearance under macOS traffic lights for classic left chrome.
 * Main content stays full-bleed to the top of the window.
 */
export const DESKTOP_TITLEBAR_PX = 47;

/** Dead-zone / folder-tab width so chrome clears traffic lights. */
export const DESKTOP_TRAFFIC_CLEAR_PX = 78;

/** Height of the folder-tab shoulder (left edge below the lights). */
export const DESKTOP_FOLDER_SHOULDER_PX = 48;
