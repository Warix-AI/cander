"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PictureInPicture2, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { FaviconImage } from "@/components/browser/FaviconImage";
import { getBrowserSurfaceAdapter } from "@/lib/browser-surface";
import {
  exitBrowserPip,
  getBrowserPipServerSnapshot,
  getBrowserPipSnapshot,
  subscribeBrowserPip,
  updateBrowserPipMeta,
} from "@/lib/browser-pip-store";
import { cn } from "@/lib/utils";

const PIP_W = 320;
const PIP_H = 200;
const CHROME_H = 36;

/**
 * Floating in-app PiP host. Native Electron views paint over the content box;
 * web-pwa uses an iframe inside the content box.
 */
export function BrowserPipOverlay() {
  const pip = useSyncExternalStore(
    subscribeBrowserPip,
    getBrowserPipSnapshot,
    getBrowserPipServerSnapshot,
  );
  const { openProject } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (!pip) {
      setPos(null);
      return;
    }
    setPos((prev) => {
      if (prev) return prev;
      const margin = 16;
      const w =
        typeof window !== "undefined" ? window.innerWidth : PIP_W + margin * 2;
      const h =
        typeof window !== "undefined" ? window.innerHeight : PIP_H + 80;
      return {
        x: Math.max(margin, w - PIP_W - margin),
        y: Math.max(margin, h - PIP_H - CHROME_H - margin - 48),
      };
    });
  }, [pip?.tabId]);

  const paintNative = useCallback(async () => {
    if (!pip || pip.webEmbed) return;
    const el = hostRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const adapter = getBrowserSurfaceAdapter();
    if (adapter.id === "web-pwa") return;
    await adapter.showTab(pip.tabId, {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, [pip]);

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
    const layoutRoot = document.getElementById("courier-main");
    layoutRoot?.addEventListener("transitionend", schedule);

    const adapter = getBrowserSurfaceAdapter();
    const unsub = adapter.subscribe((event) => {
      if (event.tabId !== pip.tabId) return;
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
      layoutRoot?.removeEventListener("transitionend", schedule);
      ro?.disconnect();
      unsub();
    };
  }, [pip, paintNative]);

  useEffect(() => {
    if (!pip || pip.webEmbed) return;
    void paintNative();
  }, [pip, pos, paintNative]);

  const closePip = useCallback(async () => {
    const tabId = pip?.tabId;
    const webEmbed = pip?.webEmbed;
    exitBrowserPip();
    if (!tabId || webEmbed) return;
    const adapter = getBrowserSurfaceAdapter();
    await adapter.setPipTab?.(null);
    await adapter.destroyTab(tabId);
  }, [pip]);

  const returnToProject = useCallback(async () => {
    const projectId = pip?.sourceProjectId;
    const tabId = pip?.tabId;
    const webEmbed = pip?.webEmbed;
    exitBrowserPip();
    if (tabId && !webEmbed) {
      const adapter = getBrowserSurfaceAdapter();
      // Release PiP retain but keep the WebContents alive for the remounted panel.
      await adapter.setPipTab?.(null);
    }
    if (projectId) openProject(projectId);
  }, [pip?.sourceProjectId, pip?.tabId, pip?.webEmbed, openProject]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pos) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const maxX = Math.max(8, window.innerWidth - PIP_W - 8);
    const maxY = Math.max(8, window.innerHeight - PIP_H - CHROME_H - 8);
    setPos({
      x: Math.min(maxX, Math.max(8, drag.origX + dx)),
      y: Math.min(maxY, Math.max(8, drag.origY + dy)),
    });
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
  };

  if (!pip || !pos) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "pointer-events-auto absolute z-[280] flex flex-col overflow-hidden rounded-[14px]",
        "border border-border/70 bg-background shadow-[0_16px_48px_rgba(0,0,0,0.22)]",
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: PIP_W,
        height: PIP_H + CHROME_H,
      }}
    >
      <div
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 border-b border-border/50 bg-muted/40 px-2 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <PictureInPicture2
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          strokeWidth={1.6}
        />
        <FaviconImage
          url={pip.url}
          faviconUrl={pip.faviconUrl}
          size={14}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium tracking-[-0.01em]">
          {pip.title || "Browser"}
        </span>
        {pip.sourceProjectId ? (
          <button
            type="button"
            onClick={() => void returnToProject()}
            className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Return
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Close picture in picture"
          onClick={() => void closePip()}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      </div>
      <div ref={hostRef} className="relative min-h-0 flex-1 bg-black">
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
    </div>
  );
}
