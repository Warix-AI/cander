type Listener = () => void;

const holdListeners = new Set<Listener>();
const releaseListeners = new Set<Listener>();

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
