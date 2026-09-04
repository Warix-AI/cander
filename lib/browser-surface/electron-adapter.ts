import type {
  BrowserSurfaceAdapter,
  BrowserSurfaceBounds,
  BrowserSurfaceCreateOptions,
  BrowserSurfaceEvent,
} from "@/lib/browser-surface/types";
import { getCanderDesktopBridge } from "@/lib/desktop-shell";

type DesktopBrowserBridge = {
  createTab: (
    tabId: string,
    initialUrl: string,
    options?: BrowserSurfaceCreateOptions,
  ) => Promise<void>;
  destroyTab: (tabId: string) => Promise<void>;
  showTab: (tabId: string, bounds: BrowserSurfaceBounds) => Promise<void>;
  hideTab: (tabId: string) => Promise<void>;
  hideAll?: () => Promise<void>;
  setChromeOverlay?: (active: boolean) => Promise<void>;
  setPipTab?: (tabId: string | null) => Promise<void>;
  navigate: (tabId: string, url: string) => Promise<void>;
  back: (tabId: string) => Promise<void>;
  forward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  stop: (tabId: string) => Promise<void>;
  onEvent?: (handler: (event: BrowserSurfaceEvent) => void) => () => void;
};

/**
 * Electron adapter — drives WebContentsView via preload IPC.
 * Falls back to no-op create when the shell build predates the browser bridge.
 */
export function createElectronBrowserSurfaceAdapter(): BrowserSurfaceAdapter {
  const listeners = new Set<(event: BrowserSurfaceEvent) => void>();
  let unsubscribeNative: (() => void) | null = null;

  const bridge = (): DesktopBrowserBridge | null => {
    const desk = getCanderDesktopBridge() as
      | (ReturnType<typeof getCanderDesktopBridge> & {
          browser?: DesktopBrowserBridge;
        })
      | undefined;
    return desk?.browser ?? null;
  };

  const ensureNativeSubscription = () => {
    if (unsubscribeNative) return;
    const native = bridge();
    if (!native?.onEvent) return;
    unsubscribeNative = native.onEvent((event) => {
      listeners.forEach((listener) => listener(event));
    });
  };

  return {
    id: "electron",
    supportsArbitraryInPanelBrowsing: true,

    async createTab(tabId, initialUrl, options) {
      ensureNativeSubscription();
      const native = bridge();
      if (!native) {
        throw new Error(
          "Electron browser bridge unavailable — update the desktop shell.",
        );
      }
      await native.createTab(tabId, initialUrl, options);
    },

    async destroyTab(tabId) {
      await bridge()?.destroyTab(tabId);
    },

    async showTab(tabId, bounds) {
      await bridge()?.showTab(tabId, bounds);
    },

    async hideTab(tabId) {
      await bridge()?.hideTab(tabId);
    },

    async navigate(tabId, url) {
      await bridge()?.navigate(tabId, url);
    },

    async back(tabId) {
      await bridge()?.back(tabId);
    },

    async forward(tabId) {
      await bridge()?.forward(tabId);
    },

    async reload(tabId) {
      await bridge()?.reload(tabId);
    },

    async stop(tabId) {
      await bridge()?.stop(tabId);
    },

    async hideAll() {
      await bridge()?.hideAll?.();
    },

    async setChromeOverlay(active: boolean) {
      await bridge()?.setChromeOverlay?.(active);
    },

    async setPipTab(tabId: string | null) {
      await bridge()?.setPipTab?.(tabId);
    },

    subscribe(listener) {
      ensureNativeSubscription();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
