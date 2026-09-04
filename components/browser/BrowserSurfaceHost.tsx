"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  areNativeBrowserSurfacesSuppressed,
  canEmbedInPwa,
  getBrowserSurfaceAdapter,
  subscribeNativeBrowserSurfaceSuppress,
  type BrowserSurfaceBounds,
} from "@/lib/browser-surface";
import {
  hasDesktopBrowserBridge,
  isDesktopShell,
} from "@/lib/desktop-shell";
import { isGoogleUrl } from "@/lib/preview-url";
import { NewTabPage } from "@/components/browser/NewTabPage";
import {
  getBrowserPipSnapshot,
  isBrowserPipTab,
  subscribeBrowserPip,
} from "@/lib/browser-pip-store";
import { startBrowserPip } from "@/lib/browser-pip";

type BrowserSurfaceHostProps = {
  tabId: string;
  url: string;
  /** Project preview / build preview — prefer iframe when embeddable. */
  previewOnly?: boolean;
  isolatedPartition?: boolean;
  reloadKey?: number;
  title?: string;
  userId?: string;
  projectId?: string | null;
  /** False when the right panel / mobile panel surface is off-screen. */
  active?: boolean;
  onUrlChange?: (url: string) => void;
  onTitleChange?: (title: string) => void;
  onFaviconChange?: (faviconUrl: string | null) => void;
  /** Open popup / target=_blank navigations as another in-app browser tab. */
  onOpenNewTab?: (url: string) => void;
};

/**
 * Hosts a platform browser surface for web / preview tabs.
 * Electron & Capacitor use native views over this placeholder bounds region.
 * Web PWA uses iframe only when embedding is permitted.
 */
export function BrowserSurfaceHost({
  tabId,
  url,
  previewOnly = false,
  isolatedPartition = false,
  reloadKey = 0,
  title = "Browser",
  userId,
  projectId = null,
  active = true,
  onUrlChange,
  onTitleChange,
  onFaviconChange,
  onOpenNewTab,
}: BrowserSurfaceHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [embedBlocked, setEmbedBlocked] = useState(false);
  const [adapterId, setAdapterId] = useState<string>("web-pwa");
  const [error, setError] = useState<string | null>(null);
  const [recoverToken, setRecoverToken] = useState(0);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const [tabReady, setTabReady] = useState(false);
  const onUrlChangeRef = useRef(onUrlChange);
  const onTitleChangeRef = useRef(onTitleChange);
  const onFaviconChangeRef = useRef(onFaviconChange);
  const onOpenNewTabRef = useRef(onOpenNewTab);
  const urlRef = useRef(url);
  const titleRef = useRef(title);
  const userIdRef = useRef(userId);
  const projectIdRef = useRef(projectId);
  onUrlChangeRef.current = onUrlChange;
  onTitleChangeRef.current = onTitleChange;
  onFaviconChangeRef.current = onFaviconChange;
  onOpenNewTabRef.current = onOpenNewTab;
  urlRef.current = url;
  titleRef.current = title;
  userIdRef.current = userId;
  projectIdRef.current = projectId;

  const suppressed = useSyncExternalStore(
    subscribeNativeBrowserSurfaceSuppress,
    areNativeBrowserSurfacesSuppressed,
    () => false,
  );
  const pipActive = useSyncExternalStore(
    subscribeBrowserPip,
    () => isBrowserPipTab(tabId),
    () => false,
  );

  const syncBounds = (): BrowserSurfaceBounds | null => {
    const el = hostRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  // Create / destroy native tab — avoid remounting on url, overlay, or visibility changes.
  // Wait for userId on ordinary web tabs so cookies always land in persist:cander-web-{userId}
  // (same jar across every project / connector for this account).
  useEffect(() => {
    if (!isolatedPartition && !userId?.trim()) {
      return;
    }
    const adapter = getBrowserSurfaceAdapter();
    setAdapterId(adapter.id);
    let cancelled = false;
    setTabReady(false);

    void (async () => {
      try {
        await adapter.createTab(tabId, url, {
          previewOnly,
          isolatedPartition,
          userId,
          projectId,
        });
        await adapter.navigate(tabId, url);
        if (cancelled) return;
        setTabReady(true);
        if (
          adapter.id === "web-pwa" &&
          !isGoogleUrl(url) &&
          !canEmbedInPwa(url, previewOnly)
        ) {
          setEmbedBlocked(true);
        } else {
          setEmbedBlocked(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          void adapter.hideTab(tabId);
        }
      }
    })();

    const unsub = adapter.subscribe((event) => {
      if (event.tabId !== tabId) return;
      if (event.type === "embedBlocked") {
        setEmbedBlocked(true);
      }
      if (event.type === "navigationFailed") {
        setError(
          "error" in event ? String(event.error) : "Navigation failed",
        );
        void adapter.hideTab(tabId);
      }
      if (event.type === "url" && "url" in event) {
        onUrlChangeRef.current?.(String(event.url));
        setError(null);
      }
      if (event.type === "title" && "title" in event) {
        onTitleChangeRef.current?.(String(event.title));
      }
      if (event.type === "favicon" && "faviconUrl" in event) {
        onFaviconChangeRef.current?.(
          event.faviconUrl ? String(event.faviconUrl) : null,
        );
      }
      if (event.type === "openInNewTab" && "url" in event) {
        onOpenNewTabRef.current?.(String(event.url));
      }
      if (event.type === "mediaPlaying") {
        // Auto video PiP — only for ordinary browsing (not isolated previews).
        const uid = userIdRef.current;
        if (
          !isolatedPartition &&
          !previewOnly &&
          !isBrowserPipTab(tabId) &&
          uid
        ) {
          const pageUrl = urlRef.current;
          void startBrowserPip({
            tabId,
            url: pageUrl,
            title: titleRef.current,
            faviconUrl: null,
            userId: uid,
            sourceProjectId: projectIdRef.current ?? null,
            webEmbed:
              adapter.id === "web-pwa" && canEmbedInPwa(pageUrl, previewOnly),
          });
        }
      }
      if (event.type === "processGone") {
        setRecoverToken((n) => n + 1);
      }
    });

    return () => {
      cancelled = true;
      setTabReady(false);
      unsub();
      // PiP owns this native tab — overlay keeps painting; do not destroy.
      if (isBrowserPipTab(tabId) || getBrowserPipSnapshot()?.tabId === tabId) {
        return;
      }
      void adapter.hideTab(tabId);
      void adapter.destroyTab(tabId);
    };
  }, [
    tabId,
    previewOnly,
    isolatedPartition,
    userId,
    projectId,
    recoverToken,
  ]);

  // Navigate existing tab when URL changes (no destroy/recreate).
  useEffect(() => {
    if (!tabReady || pipActive) return;
    const adapter = getBrowserSurfaceAdapter();
    void Promise.resolve(adapter.navigate(tabId, url)).then(() => {
      if (
        adapter.id === "web-pwa" &&
        !isGoogleUrl(url) &&
        !canEmbedInPwa(url, previewOnly)
      ) {
        setEmbedBlocked(true);
      } else if (adapter.id === "web-pwa") {
        setEmbedBlocked(false);
        setError(null);
      }
    });
  }, [tabId, url, previewOnly, tabReady, pipActive]);

  // Reload without tearing down native views.
  useEffect(() => {
    if (!tabReady || reloadKey === 0) return;
    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") {
      setIframeEpoch((value) => value + 1);
      return;
    }
    void adapter.reload(tabId);
  }, [reloadKey, tabId, tabReady]);

  // Show / hide / reposition — overlays must not destroy the underlying tab.
  // When this tab is in PiP, the overlay owns bounds — do not fight it.
  useEffect(() => {
    if (!tabReady || pipActive) return;
    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") return;

    const paint = async () => {
      if (!active || suppressed) {
        await adapter.hideTab(tabId);
        return;
      }
      const bounds = syncBounds();
      if (bounds && bounds.width > 1 && bounds.height > 1) {
        await adapter.showTab(tabId, bounds);
      }
    };

    void paint();

    let raf = 0;
    const schedulePaint = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        void paint();
      });
    };

    const onResize = () => {
      schedulePaint();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    const ro =
      typeof ResizeObserver !== "undefined" && hostRef.current
        ? new ResizeObserver(onResize)
        : null;
    if (hostRef.current && ro) {
      ro.observe(hostRef.current);
    }
    const layoutRoot = document.getElementById("courier-main");
    layoutRoot?.addEventListener("transitionend", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      layoutRoot?.removeEventListener("transitionend", onResize);
      ro?.disconnect();
    };
  }, [tabId, active, suppressed, tabReady, pipActive]);

  if (pipActive) {
    return (
      <div
        ref={hostRef}
        className="flex h-full flex-col items-center justify-center gap-2 bg-muted/30 px-6 text-center"
      >
        <p className="text-sm font-medium tracking-[-0.01em]">Playing in Picture in Picture</p>
        <p className="max-w-xs text-[12px] text-muted-foreground">
          Video is floating over Cander. Use Back on the mini player to return here.
        </p>
      </div>
    );
  }

  if (url === "about:blank") {
    return (
      <div ref={hostRef} className="h-full w-full">
        <NewTabPage
          onOpenUrl={(next) => {
            onUrlChangeRef.current?.(next);
          }}
        />
      </div>
    );
  }

  if (adapterId === "web-pwa" && isGoogleUrl(url)) {
    return (
      <div
        ref={hostRef}
        className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center"
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          Google can&apos;t be embedded in the web app. Type a URL or search
          term in the address bar above, or use the macOS / iOS app for full
          in-panel browsing.
        </p>
      </div>
    );
  }

  if (isDesktopShell() && !hasDesktopBrowserBridge()) {
    return (
      <div
        ref={hostRef}
        className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center"
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          This Cander desktop build is out of date for in-panel browsing.
          Quit the app and install the latest{" "}
          <code className="text-xs">Cander-*.dmg</code> (0.1.3+), or run{" "}
          <code className="text-xs">npm run desktop</code> from the repo.
        </p>
      </div>
    );
  }

  if (adapterId === "web-pwa" && (embedBlocked || !canEmbedInPwa(url, previewOnly))) {
    return (
      <div
        ref={hostRef}
        className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center"
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          This site can&apos;t be embedded in the web app. Keep browsing in
          this tab from the address bar, or use the macOS / iOS app for
          in-panel browsing.
        </p>
      </div>
    );
  }

  if (error && adapterId !== "web-pwa") {
    return (
      <div
        ref={hostRef}
        className="flex h-full items-center justify-center bg-muted/20 px-6 text-center text-sm text-muted-foreground"
      >
        {error}
      </div>
    );
  }

  if (adapterId === "web-pwa") {
    return (
      <div ref={hostRef} className="h-full w-full bg-white">
        <iframe
          key={`${tabId}-${reloadKey}-${iframeEpoch}-${recoverToken}-${url}`}
          title={title}
          data-tab-id={tabId}
          src={url}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          allow="accelerometer; autoplay; camera; display-capture; encrypted-media; fullscreen; microphone; clipboard-write"
          referrerPolicy="no-referrer"
          className="h-full w-full border-0 bg-white"
          onError={() => setEmbedBlocked(true)}
          onLoad={(event) => {
            try {
              const frame = event.currentTarget;
              void frame.contentWindow?.location.href;
            } catch {
              setEmbedBlocked(true);
              return;
            }
            try {
              const doc = event.currentTarget.contentDocument;
              if (doc && doc.location.href === "about:blank" && url !== "about:blank") {
                setEmbedBlocked(true);
              }
            } catch {
              // Opaque cross-origin document is expected for successful embeds.
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 bg-white dark:bg-neutral-950"
      data-browser-surface={adapterId}
      data-tab-id={tabId}
      aria-label={title}
    />
  );
}
