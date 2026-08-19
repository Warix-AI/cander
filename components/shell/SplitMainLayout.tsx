"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function SplitMainLayout({ children }: { children: ReactNode }) {
  const { panelMode, panelRatio, view } = useApp();
  const bannerFlush = view === "space";
  const panelOn = panelMode !== "collapsed";
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, 0.58) * 100
      : panelRatio * 100;
  const [slideWidth, setSlideWidth] = useState(0);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (immersive) {
      setSlideWidth(panelOn ? 100 : 0);
      wasOpen.current = panelOn;
      return;
    }
    if (!panelOn) {
      setSlideWidth(0);
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      setSlideWidth(0);
      const id = window.setTimeout(() => {
        setSlideWidth(panelPct);
        wasOpen.current = true;
      }, 180);
      return () => window.clearTimeout(id);
    }
    setSlideWidth(panelPct);
  }, [panelOn, immersive, panelPct]);

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          immersive ? "w-[22.5rem] shrink-0" : "min-w-0 flex-1",
        )}
      >
        {bannerFlush ? null : <TopRail />}
        {children}
      </div>
      {panelOn ? (
        <>
          {slideWidth > 0 ? <ResizeHandle /> : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden",
              immersive ? "flex-1" : "shrink-0",
              !immersive &&
                "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
            style={immersive ? undefined : { width: `${slideWidth}%` }}
          >
            <ContextPanel />
          </div>
        </>
      ) : null}
    </div>
  );
}
