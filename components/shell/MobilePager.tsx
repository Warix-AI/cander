"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { MobileSurface } from "@/lib/types";
import { consumeSkipMobilePagerTransition } from "@/lib/mobile-nav-transition";
import { cn } from "@/lib/utils";
import { getBrowserSurfaceAdapter } from "@/lib/browser-surface";

/**
 * Full-width horizontal pager: each child is one screen.
 * Uses pixel translates so native overlays and subpixel % math don't leave a sliver.
 */
export function MobilePager({
  panes,
  active,
  children,
  className,
}: {
  panes: MobileSurface[];
  active: MobileSurface;
  children: ReactNode[];
  className?: string;
}) {
  const n = Math.max(panes.length, 1);
  const safeActive = panes.includes(active) ? active : panes[0]!;
  const index = Math.max(0, panes.indexOf(safeActive));
  const [trackedIndex, setTrackedIndex] = useState(index);
  const [animate, setAnimate] = useState(true);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Sync during render so a "back to space" skip applies before paint.
  if (index !== trackedIndex) {
    setTrackedIndex(index);
    setAnimate(!consumeSkipMobilePagerTransition());
  }

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      setWidth((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (animate) return;
    const id = window.requestAnimationFrame(() => setAnimate(true));
    return () => window.cancelAnimationFrame(id);
  }, [animate, trackedIndex]);

  // Hide native browser surfaces immediately when leaving the panel pane so
  // WKWebView / WebContentsView never peek over chat during / after the slide.
  useEffect(() => {
    if (safeActive === "panel") return;
    void getBrowserSurfaceAdapter().hideAll?.();
  }, [safeActive]);

  // When returning to panel, wait until the transform settles before showing
  // (BrowserSurfaceHost re-shows via its own active prop + bounds).
  useEffect(() => {
    if (safeActive !== "panel" || !animate) return;
    const t = window.setTimeout(() => {
      // no-op: surface hosts paint from active=true after transition
    }, 520);
    return () => window.clearTimeout(t);
  }, [safeActive, animate, trackedIndex]);

  const offsetPx = width > 0 ? Math.round(index * width) : 0;

  return (
    <div
      ref={viewportRef}
      className={cn("relative min-h-0 min-w-0 flex-1 overflow-hidden", className)}
    >
      <div
        className={cn(
          "flex h-full will-change-transform",
          animate &&
            "transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        )}
        style={{
          width: width > 0 ? width * n : `${n * 100}%`,
          transform:
            width > 0
              ? `translate3d(-${offsetPx}px, 0, 0)`
              : `translate3d(-${(index * 100) / n}%, 0, 0)`,
        }}
      >
        {children.map((child, i) => (
          <div
            key={panes[i] ?? i}
            className={cn(
              "flex h-full min-w-0 flex-col overflow-hidden",
              panes[i] !== safeActive && "pointer-events-none",
            )}
            style={{
              width: width > 0 ? width : `${100 / n}%`,
              flex: width > 0 ? `0 0 ${width}px` : undefined,
            }}
            aria-hidden={panes[i] !== safeActive}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
