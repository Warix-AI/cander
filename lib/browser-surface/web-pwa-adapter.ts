import type {
  BrowserSurfaceAdapter,
  BrowserSurfaceBounds,
  BrowserSurfaceCreateOptions,
  BrowserSurfaceEvent,
} from "@/lib/browser-surface/types";
import { canEmbedInPwa } from "@/lib/browser-surface/local-browsing";

type TabState = {
  url: string;
  options?: BrowserSurfaceCreateOptions;
  visible: boolean;
  bounds: BrowserSurfaceBounds | null;
};

/**
 * Web / PWA adapter: iframe only for Cander-owned or explicitly embeddable hosts.
 * Arbitrary sites must open externally. Hosted remote-browser mode is intentionally
 * not enabled — keep cost/lifecycle separate if product later requires it.
 */
export function createWebPwaBrowserSurfaceAdapter(): BrowserSurfaceAdapter {
  const tabs = new Map<string, TabState>();
  const listeners = new Set<(event: BrowserSurfaceEvent) => void>();

  const emit = (event: BrowserSurfaceEvent) => {
    listeners.forEach((listener) => listener(event));
  };

  return {
    id: "web-pwa",
    supportsArbitraryInPanelBrowsing: false,

    createTab(tabId, initialUrl, options) {
      tabs.set(tabId, {
        url: initialUrl,
        options,
        visible: false,
        bounds: null,
      });
      emit({ type: "url", tabId, url: initialUrl });
      if (!canEmbedInPwa(initialUrl, options?.previewOnly)) {
        emit({ type: "embedBlocked", tabId, url: initialUrl });
      }
    },

    destroyTab(tabId) {
      tabs.delete(tabId);
    },

    showTab(tabId, bounds) {
      const tab = tabs.get(tabId);
      if (!tab) return;
      tab.visible = true;
      tab.bounds = bounds;
    },

    hideTab(tabId) {
      const tab = tabs.get(tabId);
      if (!tab) return;
      tab.visible = false;
    },

    navigate(tabId, url) {
      const tab = tabs.get(tabId);
      if (!tab) return;
      tab.url = url;
      emit({ type: "url", tabId, url });
      if (!canEmbedInPwa(url, tab.options?.previewOnly)) {
        emit({ type: "embedBlocked", tabId, url });
      }
    },

    back() {
      /* History is owned by project-browser-session for web-pwa. */
    },
    forward() {},
    reload() {},
    stop() {},

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export { canEmbedInPwa } from "@/lib/browser-surface/local-browsing";
