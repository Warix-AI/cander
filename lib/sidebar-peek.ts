type Listener = () => void;

const holdListeners = new Set<Listener>();
const releaseListeners = new Set<Listener>();
const peekListeners = new Set<Listener>();

let peeking = false;

/** Keep a hover-peeked sidebar open (e.g. while a portaled menu is hovered). */
export function holdSidebarPeek() {
  holdListeners.forEach((listener) => listener());
}

/** Allow a hover-peeked sidebar to close after leaving a portaled menu. */
export function releaseSidebarPeek() {
  releaseListeners.forEach((listener) => listener());
}

export function subscribeSidebarPeekHold(listener: Listener) {
  holdListeners.add(listener);
  return () => {
    holdListeners.delete(listener);
  };
}

export function subscribeSidebarPeekRelease(listener: Listener) {
  releaseListeners.add(listener);
  return () => {
    releaseListeners.delete(listener);
  };
}

/** Publish whether the left sidebar is edge-peeking (closed + hover open). */
export function setSidebarPeeking(next: boolean) {
  if (peeking === next) return;
  peeking = next;
  peekListeners.forEach((listener) => listener());
}

export function getSidebarPeeking() {
  return peeking;
}

export function getSidebarPeekingServerSnapshot() {
  return false;
}

export function subscribeSidebarPeeking(listener: Listener) {
  peekListeners.add(listener);
  return () => {
    peekListeners.delete(listener);
  };
}
