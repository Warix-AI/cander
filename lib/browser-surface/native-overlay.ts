/**
 * Suppress native Electron/Capacitor browser views while React chrome
 * (dropdowns, sheets) needs hit-testing, or when the panel is off-screen.
 */

type Listener = () => void;

let suppressCount = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
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
