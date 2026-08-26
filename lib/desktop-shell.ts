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
 * Classic Mac titlebar / WindowChrome row height (traffic-light axis).
 * Main content stays full-bleed; only left chrome uses this.
 */
export const DESKTOP_TITLEBAR_PX = 52;

/**
 * Left inset so classic Mac header controls sit just past the traffic lights.
 * trafficLightPosition.x (16) + lights + a small gap (~80px).
 */
export const DESKTOP_TRAFFIC_CLEAR_PX = 80;
