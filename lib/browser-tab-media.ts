type Listener = () => void;

const playingWebTabs = new Set<string>();
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Track native mediaPlaying / mediaPaused for instant tab-switch PiP. */
export function markBrowserTabMediaPlaying(tabId: string, playing: boolean) {
  const before = playingWebTabs.has(tabId);
  if (playing) playingWebTabs.add(tabId);
  else playingWebTabs.delete(tabId);
  if (before !== playingWebTabs.has(tabId)) emit();
}

export function isBrowserTabMediaPlaying(tabId: string): boolean {
  return playingWebTabs.has(tabId);
}

export function clearBrowserTabMediaPlaying(tabId: string) {
  if (!playingWebTabs.has(tabId)) return;
  playingWebTabs.delete(tabId);
  emit();
}

export function subscribeBrowserTabMediaPlaying(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
