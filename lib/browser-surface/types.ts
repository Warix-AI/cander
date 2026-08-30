/**
 * Platform browser surface contract.
 * Shared tab chrome calls this; Electron / Capacitor / Web-PWA implement it.
 */

export type BrowserSurfaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserSurfaceCreateOptions = {
  /** Isolate cookies/storage from ordinary browsing (project previews). */
  isolatedPartition?: boolean;
  /** Allow only Cander-owned / known-embeddable hosts when on web PWA. */
  previewOnly?: boolean;
  userId?: string;
  projectId?: string | null;
};

export type BrowserSurfaceEventMap = {
  url: { tabId: string; url: string };
  title: { tabId: string; title: string };
  favicon: { tabId: string; faviconUrl: string | null };
  loading: { tabId: string; loading: boolean };
  navigationFailed: { tabId: string; url: string; error: string };
  permissionRequest: {
    tabId: string;
    permission: string;
    origin: string;
  };
  processGone: { tabId: string; reason: string };
  embedBlocked: { tabId: string; url: string };
};

export type BrowserSurfaceEvent =
  BrowserSurfaceEventMap[keyof BrowserSurfaceEventMap] & {
    type: keyof BrowserSurfaceEventMap;
  };

export type BrowserSurfaceAdapterId = "electron" | "capacitor" | "web-pwa";

export interface BrowserSurfaceAdapter {
  readonly id: BrowserSurfaceAdapterId;
  /** True when ordinary sites can be browsed in-panel without a remote stream. */
  readonly supportsArbitraryInPanelBrowsing: boolean;

  createTab(
    tabId: string,
    initialUrl: string,
    options?: BrowserSurfaceCreateOptions,
  ): Promise<void> | void;
  destroyTab(tabId: string): Promise<void> | void;
  showTab(tabId: string, bounds: BrowserSurfaceBounds): Promise<void> | void;
  hideTab(tabId: string): Promise<void> | void;
  navigate(tabId: string, url: string): Promise<void> | void;
  back(tabId: string): Promise<void> | void;
  forward(tabId: string): Promise<void> | void;
  reload(tabId: string): Promise<void> | void;
  stop(tabId: string): Promise<void> | void;
  subscribe(listener: (event: BrowserSurfaceEvent) => void): () => void;
}
