type Listener = () => void;

const playingWebTabs = new Set<string>();
/** Sticky “recently playing” so brief pause-on-blur still triggers PiP. */
const stickyPlayingUntil = new Map<string, number>();
const STICKY_MS = 90_000;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Track native mediaPlaying / mediaPaused for instant tab-switch PiP. */
export function markBrowserTabMediaPlaying(tabId: string, playing: boolean) {
  const before = isBrowserTabMediaPlaying(tabId);
  if (playing) {
    playingWebTabs.add(tabId);
    stickyPlayingUntil.set(tabId, Date.now() + STICKY_MS);
  } else {
    playingWebTabs.delete(tabId);
    // Keep sticky window — Chromium often pauses media the instant focus leaves.
  }
  if (before !== isBrowserTabMediaPlaying(tabId)) emit();
}

export function isBrowserTabMediaPlaying(tabId: string): boolean {
  if (playingWebTabs.has(tabId)) return true;
  const until = stickyPlayingUntil.get(tabId) ?? 0;
  return Date.now() < until;
}

export function clearBrowserTabMediaPlaying(tabId: string) {
  const before = isBrowserTabMediaPlaying(tabId);
  playingWebTabs.delete(tabId);
  stickyPlayingUntil.delete(tabId);
  if (before) emit();
}

export function subscribeBrowserTabMediaPlaying(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
