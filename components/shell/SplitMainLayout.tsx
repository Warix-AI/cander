"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { MobileArmedPanelChrome } from "@/components/shell/MobileSurfaceChrome";
import { TopRail } from "@/components/shell/TopRail";
import { useApp } from "@/components/app/AppProvider";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function SplitMainLayout({ children }: { children: ReactNode }) {
  const {
    panelMode,
    panelRatio,
    view,
    drafting,
    thread,
    mobileSurface,
    setPanelMode,
  } = useApp();
  const mobile = useMobileShell();
  const bannerFlush = view === "space" && !drafting && !thread;
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

  const mobileExclusive = mobile && panelOn;
  const showChat = !mobileExclusive || mobileSurface === "chat";
  const showPanel = !mobileExclusive || mobileSurface === "panel";

  useEffect(() => {
    if (mobileExclusive) {
      setSlideWidth(showPanel ? 100 : 0);
      wasOpen.current = panelOn;
      return;
    }
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
  }, [panelOn, immersive, panelPct, mobileExclusive, showPanel]);

  const showResize = panelOn && slideWidth > 0 && !mobile && !immersive;

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          mobileExclusive
            ? showChat
              ? "min-w-0 flex-1"
              : "pointer-events-none w-0 overflow-hidden"
            : immersive
              ? "w-[22.5rem] shrink-0"
              : "min-w-0 flex-1",
        )}
        aria-hidden={mobileExclusive && !showChat}
      >
        {bannerFlush ? null : <TopRail />}
        {showChat || !mobileExclusive ? children : null}
      </div>
      {panelOn ? (
        <>
          {showResize ? <ResizeHandle /> : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden",
              mobileExclusive
                ? showPanel
                  ? "min-w-0 flex-1"
                  : "pointer-events-none w-0 overflow-hidden"
                : immersive
                  ? "flex-1"
                  : "shrink-0",
              !immersive &&
                !mobileExclusive &&
                "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              slideWidth > 0 &&
                showChat &&
                !mobileExclusive &&
                "border-l border-border",
            )}
            style={
              immersive || mobileExclusive
                ? undefined
                : { width: `${slideWidth}%` }
            }
            aria-hidden={mobileExclusive && !showPanel}
          >
            {mobileExclusive && showPanel ? (
              <MobileArmedPanelChrome
                onClose={() => setPanelMode("collapsed")}
              />
            ) : null}
            {showPanel || !mobileExclusive ? <ContextPanel /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
