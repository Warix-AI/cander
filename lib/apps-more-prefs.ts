/**
 * Session-only expand/collapse for the sidebar Apps → More discovery list.
 */

type Listener = () => void;

let moreOpen = false;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeAppsMoreOpen(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppsMoreOpenSnapshot() {
  return moreOpen;
}

export function getAppsMoreOpenServerSnapshot() {
  return false;
}

export function setAppsMoreOpen(open: boolean) {
  if (moreOpen === open) return;
  moreOpen = open;
  emit();
}

export function toggleAppsMoreOpen() {
  moreOpen = !moreOpen;
  emit();
}
