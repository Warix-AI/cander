/**
 * Height of the absolute MobileFloatingNav chrome. Native browser surfaces
 * (WKWebView / WebContentsView) sit above the Capacitor/Electron HTML layer,
 * so they must leave this bottom strip uncovered for the React nav to stay
 * visible and tappable.
 */

type Listener = () => void;

let reservePx = 0;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setMobileFloatingNavReserve(px: number) {
  const next = Math.max(0, Math.round(px));
  if (next === reservePx) return;
  reservePx = next;
  emit();
}

export function getMobileFloatingNavReserve() {
  return reservePx;
}

export function subscribeMobileFloatingNavReserve(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
