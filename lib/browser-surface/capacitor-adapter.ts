import type {
  BrowserSurfaceAdapter,
  BrowserSurfaceBounds,
  BrowserSurfaceCreateOptions,
  BrowserSurfaceEvent,
} from "@/lib/browser-surface/types";

type CapacitorBrowserPlugin = {
  createTab: (opts: {
    tabId: string;
    url: string;
    isolated?: boolean;
    projectId?: string;
  }) => Promise<void>;
  destroyTab: (opts: { tabId: string }) => Promise<void>;
  showTab: (opts: {
    tabId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<void>;
  hideTab: (opts: { tabId: string }) => Promise<void>;
  navigate: (opts: { tabId: string; url: string }) => Promise<void>;
  back: (opts: { tabId: string }) => Promise<void>;
  forward: (opts: { tabId: string }) => Promise<void>;
  reload: (opts: { tabId: string }) => Promise<void>;
  stop: (opts: { tabId: string }) => Promise<void>;
  hideAll?: () => Promise<void>;
  addListener?: (
    eventName: string,
    handler: (event: BrowserSurfaceEvent) => void,
  ) => Promise<{ remove: () => void }> | { remove: () => void };
};

function getPlugin(): CapacitorBrowserPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { Plugins?: { CanderBrowser?: CapacitorBrowserPlugin } };
    }
  ).Capacitor;
  return cap?.Plugins?.CanderBrowser ?? null;
}

/**
 * Capacitor iOS adapter — requires native CanderBrowser plugin (WKWebView).
 * Standard Capacitor Browser plugin opens SFSafariViewController and is not used.
 */
export function createCapacitorBrowserSurfaceAdapter(): BrowserSurfaceAdapter {
  const listeners = new Set<(event: BrowserSurfaceEvent) => void>();
  let removeNative: (() => void) | null = null;

  const ensureNativeSubscription = async () => {
    if (removeNative) return;
    const plugin = getPlugin();
    if (!plugin?.addListener) return;
    const handle = await plugin.addListener("browserEvent", (event) => {
      listeners.forEach((listener) => listener(event));
    });
    removeNative = () => handle.remove();
  };

  return {
    id: "capacitor",
    supportsArbitraryInPanelBrowsing: true,

    async createTab(tabId, initialUrl, options?: BrowserSurfaceCreateOptions) {
      await ensureNativeSubscription();
      const plugin = getPlugin();
      if (!plugin) {
        throw new Error(
          "CanderBrowser native plugin unavailable — update the iOS app.",
        );
      }
      await plugin.createTab({
        tabId,
        url: initialUrl,
        isolated: Boolean(options?.isolatedPartition),
        projectId: options?.projectId ?? undefined,
      });
    },

    async destroyTab(tabId) {
      await getPlugin()?.destroyTab({ tabId });
    },

    async showTab(tabId, bounds: BrowserSurfaceBounds) {
      await getPlugin()?.showTab({
        tabId,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
    },

    async hideTab(tabId) {
      await getPlugin()?.hideTab({ tabId });
    },

    async navigate(tabId, url) {
      await getPlugin()?.navigate({ tabId, url });
    },

    async back(tabId) {
      await getPlugin()?.back({ tabId });
    },

    async forward(tabId) {
      await getPlugin()?.forward({ tabId });
    },

    async reload(tabId) {
      await getPlugin()?.reload({ tabId });
    },

    async stop(tabId) {
      await getPlugin()?.stop({ tabId });
    },

    async hideAll() {
      await getPlugin()?.hideAll?.();
    },

    subscribe(listener) {
      void ensureNativeSubscription();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
