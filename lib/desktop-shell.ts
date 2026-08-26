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
 * Clearance under macOS traffic lights for left chrome when menus sit below them.
 * Main content stays full-bleed to the top of the window.
 */
export const DESKTOP_TITLEBAR_PX = 47;

/** Left padding so header controls clear the traffic lights inside a Mac panel. */
export const DESKTOP_TRAFFIC_CLEAR_PX = 72;

/** Wider workspace rail in the Mac desktop shell. */
export const DESKTOP_RAIL_WIDTH_PX = 68;
