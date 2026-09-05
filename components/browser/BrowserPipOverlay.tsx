"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { getBrowserSurfaceAdapter } from "@/lib/browser-surface";
import {
  exitBrowserPip,
  getBrowserPipServerSnapshot,
  getBrowserPipSnapshot,
  PIP_CHROME_HEIGHT,
  PIP_MAX_HEIGHT,
  PIP_MAX_WIDTH,
  PIP_MIN_HEIGHT,
  PIP_MIN_WIDTH,
  subscribeBrowserPip,
  updateBrowserPipMeta,
  updateBrowserPipSize,
} from "@/lib/browser-pip-store";
import { clearBrowserTabMediaPlaying } from "@/lib/browser-tab-media";
import { activateProjectBrowserTab } from "@/lib/project-browser-session";
import { STANDALONE_BROWSER_PROJECT_ID } from "@/lib/standalone-browser-session";
import { cn } from "@/lib/utils";

type Corner = "nw" | "ne" | "sw" | "se";

/**
 * Floating video PiP — fixed to the viewport so it survives space/settings
 * navigation. Native Electron views paint over the content box.
 *
 * Hover chrome grows *above* the video (same video bounds) so the native
 * surface does not resize/flicker.
 */
export function BrowserPipOverlay() {
  const pip = useSyncExternalStore(
    subscribeBrowserPip,
    getBrowserPipSnapshot,
    getBrowserPipServerSnapshot,
  );
  const { openProject, openStandaloneBrowser } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    corner: Corner;
    startX: number;
    startY: number;
    origW: number;
    origH: number;
    origX: number;
    origY: number;
  } | null>(null);
  const lastPaintBounds = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!pip) {
      setPos(null);
      setHovered(false);
      lastPaintBounds.current = null;
      return;
    }
    setPos((prev) => {
      if (prev) return prev;
      const margin = 16;
      const w =
        typeof window !== "undefined" ? window.innerWidth : pip.width + margin * 2;
      const h =
        typeof window !== "undefined" ? window.innerHeight : pip.height + 80;
      return {
        x: Math.max(margin, w - pip.width - margin),
        y: Math.max(margin, h - pip.height - margin - 48),
      };
    });
  }, [pip?.tabId, pip?.width, pip?.height]);

  // Native views steal mouse events — poll cursor vs PiP (+ header) bounds,
  // and pass pointer events through to React so drag/chrome work over the browser.
  useEffect(() => {
    if (!pip || pip.webEmbed) {
      const adapter = getBrowserSurfaceAdapter();
      void adapter.setPipPointerPassthrough?.(false);
      return;
    }
    const adapter = getBrowserSurfaceAdapter();
    if (typeof adapter.isPipCursorHit !== "function") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const hit = await adapter.isPipCursorHit!();
        if (cancelled) return;
        const interactive = Boolean(hit) || dragging;
        setHovered(interactive);
        await adapter.setPipPointerPassthrough?.(interactive);
      } catch {
        // ignore
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 80);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      void adapter.setPipPointerPassthrough?.(false);
    };
  }, [pip?.tabId, pip?.webEmbed, dragging]);

  const paintNative = useCallback(async () => {
    if (!pip || pip.webEmbed) return;
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") return;
    if (rect.width < 2 || rect.height < 2) return;
    const next = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    const prev = lastPaintBounds.current;
    if (
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.width === next.width &&
      prev.height === next.height
    ) {
      return;
    }
    lastPaintBounds.current = next;
    await adapter.showTab(pip.tabId, next);
  }, [pip?.tabId, pip?.webEmbed]);

  useEffect(() => {
    if (!pip || pip.webEmbed) return;
    void paintNative();
    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        void paintNative();
      });
    };
    window.addEventListener("resize", schedule);
    const ro =
      typeof ResizeObserver !== "undefined" && hostRef.current
        ? new ResizeObserver(schedule)
        : null;
    if (hostRef.current && ro) ro.observe(hostRef.current);

    const adapter = getBrowserSurfaceAdapter();
    const tabId = pip.tabId;
    const unsub = adapter.subscribe((event) => {
      if (event.tabId !== tabId) return;
      if (event.type === "url" && "url" in event) {
        updateBrowserPipMeta({ url: String(event.url) });
      }
      if (event.type === "title" && "title" in event) {
        updateBrowserPipMeta({ title: String(event.title) });
      }
      if (event.type === "favicon" && "faviconUrl" in event) {
        updateBrowserPipMeta({
          faviconUrl: event.faviconUrl ? String(event.faviconUrl) : null,
        });
      }
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      unsub();
    };
  }, [pip?.tabId, pip?.webEmbed, paintNative]);

  // Only re-paint when video geometry changes — not when hover chrome toggles.
  useEffect(() => {
    if (!pip || pip.webEmbed) return;
    lastPaintBounds.current = null;
    void paintNative();
  }, [pip?.tabId, pip?.webEmbed, pip?.width, pip?.height, pos, paintNative]);

  const closePip = useCallback(async () => {
    const tabId = pip?.tabId;
    const webEmbed = pip?.webEmbed;
    exitBrowserPip();
    if (!tabId || webEmbed) return;
    const adapter = getBrowserSurfaceAdapter();
    await adapter.pauseMedia?.(tabId);
    clearBrowserTabMediaPlaying(tabId);
    await adapter.setPipTab?.(null);
    await adapter.hideTab(tabId);
  }, [pip]);

  const returnToProject = useCallback(async () => {
    const projectId = pip?.sourceProjectId;
    const tabId = pip?.tabId;
    const webEmbed = pip?.webEmbed;
    if (tabId) {
      activateProjectBrowserTab(tabId);
    }
    exitBrowserPip();
    if (tabId && !webEmbed) {
      const adapter = getBrowserSurfaceAdapter();
      await adapter.setPipTab?.(null);
    }
    if (projectId === STANDALONE_BROWSER_PROJECT_ID) {
      openStandaloneBrowser?.();
      return;
    }
    if (projectId) openProject(projectId);
  }, [
    pip?.sourceProjectId,
    pip?.tabId,
    pip?.webEmbed,
    openProject,
    openStandaloneBrowser,
  ]);

  const onDragDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pos || !pip) return;
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("[data-pip-resize]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setHovered(true);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const onDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !pip) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const maxX = Math.max(8, window.innerWidth - pip.width - 8);
    const maxY = Math.max(8, window.innerHeight - pip.height - 8);
    setPos({
      x: Math.min(maxX, Math.max(8, drag.origX + dx)),
      y: Math.min(maxY, Math.max(8, drag.origY + dy)),
    });
  };

  const onDragUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const onResizeDown =
    (corner: Corner) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!pip || !pos) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      resizeRef.current = {
        pointerId: event.pointerId,
        corner,
        startX: event.clientX,
        startY: event.clientY,
        origW: pip.width,
        origH: pip.height,
        origX: pos.x,
        origY: pos.y,
      };
    };

  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId || !pip) return;
    const dx = event.clientX - resize.startX;
    const dy = event.clientY - resize.startY;
    let nextW = resize.origW;
    let nextH = resize.origH;
    let nextX = resize.origX;
    let nextY = resize.origY;

    if (resize.corner.includes("e")) nextW = resize.origW + dx;
    if (resize.corner.includes("w")) {
      nextW = resize.origW - dx;
      nextX = resize.origX + dx;
    }
    if (resize.corner.includes("s")) nextH = resize.origH + dy;
    if (resize.corner.includes("n")) {
      nextH = resize.origH - dy;
      nextY = resize.origY + dy;
    }

    nextW = Math.min(PIP_MAX_WIDTH, Math.max(PIP_MIN_WIDTH, nextW));
    nextH = Math.min(PIP_MAX_HEIGHT, Math.max(PIP_MIN_HEIGHT, nextH));
    if (resize.corner.includes("w")) {
      nextX = resize.origX + (resize.origW - nextW);
    }
    if (resize.corner.includes("n")) {
      nextY = resize.origY + (resize.origH - nextH);
    }

    const maxX = Math.max(8, window.innerWidth - nextW - 8);
    const maxY = Math.max(8, window.innerHeight - nextH - 8);
    setPos({
      x: Math.min(maxX, Math.max(8, nextX)),
      y: Math.min(maxY, Math.max(8, nextY)),
    });
    updateBrowserPipSize(nextW, nextH);
  };

  const onResizeUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId === event.pointerId) {
      resizeRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
  };

  if (!pip || !pos) return null;

  const showChrome = hovered || dragging;
  // Grow upward: video screen position stays fixed; header adds above.
  const rootTop = showChrome ? pos.y - PIP_CHROME_HEIGHT : pos.y;
  const rootHeight = showChrome ? pip.height + PIP_CHROME_HEIGHT : pip.height;

  const cornerHandle = (corner: Corner, className: string, cursor: string) => (
    <div
      key={corner}
      data-pip-resize={corner}
      onPointerDown={onResizeDown(corner)}
      onPointerMove={onResizeMove}
      onPointerUp={onResizeUp}
      onPointerCancel={onResizeUp}
      className={cn("absolute z-20 h-4 w-4", className, cursor)}
      aria-hidden
    />
  );

  return (
    <div
      className={cn(
        "pointer-events-auto fixed z-[400] overflow-hidden bg-black",
        "shadow-[0_16px_48px_rgba(0,0,0,0.28)] rounded-none",
      )}
      style={{
        left: pos.x,
        top: rootTop,
        width: pip.width,
        height: rootHeight,
      }}
      onPointerEnter={() => {
        if (pip.webEmbed) setHovered(true);
      }}
      onPointerLeave={() => {
        if (pip.webEmbed && !dragging) setHovered(false);
      }}
    >
      {showChrome ? (
        <div
          className="absolute inset-x-0 top-0 z-10 flex h-9 cursor-grab items-center gap-2 bg-neutral-950 px-2 active:cursor-grabbing"
          style={{ height: PIP_CHROME_HEIGHT }}
          onPointerDown={onDragDown}
          onPointerMove={onDragMove}
          onPointerUp={onDragUp}
          onPointerCancel={onDragUp}
        >
          <FaviconImage url={pip.url} faviconUrl={pip.faviconUrl} size={14} />
          <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium tracking-[-0.01em] text-white">
            {pip.title || "Video"}
          </span>
          {pip.sourceProjectId ? (
            <button
              type="button"
              onClick={() => void returnToProject()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Return to tab"
              title="Return to tab"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close picture in picture"
            onClick={() => void closePip()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      ) : null}

      {/* Video host — fixed height; never shrinks when chrome appears. */}
      <div
        ref={hostRef}
        className="absolute inset-x-0 bottom-0 bg-black"
        style={{ height: pip.height }}
      >
        {pip.webEmbed ? (
          <iframe
            title={pip.title}
            src={pip.url}
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            allow="accelerometer; autoplay; camera; display-capture; encrypted-media; fullscreen; microphone; clipboard-write"
            referrerPolicy="no-referrer"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="h-full w-full" aria-hidden />
        )}
      </div>

      {showChrome ? (
        <>
          {cornerHandle("nw", "top-0 left-0", "cursor-nwse-resize")}
          {cornerHandle("ne", "top-0 right-0", "cursor-nesw-resize")}
          {cornerHandle("sw", "bottom-0 left-0", "cursor-nesw-resize")}
          {cornerHandle("se", "right-0 bottom-0", "cursor-nwse-resize")}
        </>
      ) : null}
    </div>
  );
}
