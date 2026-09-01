/**
 * Suppress native Electron/Capacitor browser views while React chrome
 * (dropdowns, sheets) needs hit-testing, or when the panel is off-screen.
 */

type Listener = () => void;

let suppressCount = 0;
let chromeOverlayCount = 0;
const listeners = new Set<Listener>();
const chromeOverlayListeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

function emitChromeOverlay() {
  chromeOverlayListeners.forEach((listener) => listener());
}

export function suppressNativeBrowserSurfaces() {
  suppressCount += 1;
  emit();
}

export function resumeNativeBrowserSurfaces() {
  suppressCount = Math.max(0, suppressCount - 1);
  emit();
}

export function areNativeBrowserSurfacesSuppressed() {
  return suppressCount > 0;
}

export function subscribeNativeBrowserSurfaceSuppress(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function incrementChromeOverlayCount() {
  chromeOverlayCount += 1;
  emitChromeOverlay();
}

export function decrementChromeOverlayCount() {
  chromeOverlayCount = Math.max(0, chromeOverlayCount - 1);
  emitChromeOverlay();
}

export function isChromeOverlayActive() {
  return chromeOverlayCount > 0;
}

export function subscribeChromeOverlay(listener: Listener) {
  chromeOverlayListeners.add(listener);
  return () => {
    chromeOverlayListeners.delete(listener);
  };
}
