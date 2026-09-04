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
  /** Popup / target=_blank from the page — open as another in-app tab. */
  openInNewTab: { tabId: string; url: string };
  /** Native Chromium media started (video/audio). */
  mediaPlaying: { tabId: string };
  mediaPaused: { tabId: string };
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
  /** Hide every native surface (panel off-screen / chat covering). */
  hideAll?(): Promise<void> | void;
  /** Temporarily collapse views so React overlays receive pointer events. */
  setChromeOverlay?(active: boolean): Promise<void> | void;
  /** Retain this tab for in-app PiP (skip hideAll / destroy while set). */
  setPipTab?(tabId: string | null): Promise<void> | void;
  /** True when a <video> is actively playing in the native tab. */
  hasPlayingVideo?(tabId: string): Promise<boolean> | boolean;
  navigate(tabId: string, url: string): Promise<void> | void;
  back(tabId: string): Promise<void> | void;
  forward(tabId: string): Promise<void> | void;
  reload(tabId: string): Promise<void> | void;
  stop(tabId: string): Promise<void> | void;
  subscribe(listener: (event: BrowserSurfaceEvent) => void): () => void;
}
