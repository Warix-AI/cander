/**
 * Client-side pointer to the active right-panel tab (selected tab only).
 * Updated by ProjectBrowserPanel; read by browser-context tools.
 */

import type {
  ActiveBrowserTab,
  BrowserContextTabKind,
} from "@/lib/browser-context/types";

type Listener = () => void;

let active: ActiveBrowserTab | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function setActiveBrowserContextTab(
  next: {
    tabId: string;
    tabKind: BrowserContextTabKind;
    title: string;
    url: string;
    projectId?: string;
    sessionId?: string;
    canReadText?: boolean;
    canCaptureViewport?: boolean;
  } | null,
) {
  if (!next) {
    active = null;
    emit();
    return;
  }
  active = {
    tabId: next.tabId,
    tabKind: next.tabKind,
    title: next.title,
    url: next.url,
    projectId: next.projectId,
    sessionId: next.sessionId,
    canReadText: next.canReadText ?? true,
    canCaptureViewport: next.canCaptureViewport ?? true,
  };
  emit();
}

export function getActiveBrowserContextTab(): ActiveBrowserTab | null {
  return active;
}

export function subscribeActiveBrowserContextTab(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
