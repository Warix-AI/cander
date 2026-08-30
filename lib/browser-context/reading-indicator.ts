/**
 * Subtle UI signal while Cander reads / captures the active browser tab.
 */

type Listener = () => void;

let reading = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function setBrowserContextReading(active: boolean) {
  if (reading === active) return;
  reading = active;
  emit();
}

export function isBrowserContextReading(): boolean {
  return reading;
}

export function subscribeBrowserContextReading(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
