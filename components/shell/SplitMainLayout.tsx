"use client";

import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { RightPanelToggleDock } from "@/components/shell/PanelToggle";
import { MobileContentPager } from "@/components/shell/MobileContentPager";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";
import type { MobileSurface } from "@/lib/types";

export function SplitMainLayout({ children }: { children: ReactNode }) {
  const {
    panelMode,
    panelRatio,
    dragging,
    view,
    drafting,
    thread,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
    mobileSurface,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const hideTopRail = view === "space" && !drafting && !thread;
  const panelOn = panelMode !== "collapsed";
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, 0.58) * 100
      : panelRatio * 100;
  const canPanel = canUseRightPanel({
    view,
    thread,
    drafting,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
  });
  const [slideWidth, setSlideWidth] = useState(0);
  const [panelMounted, setPanelMounted] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (mobile) {
      queueMicrotask(() => setPanelMounted(canPanel && panelOn));
      return;
    }
    if (immersive) {
      queueMicrotask(() => {
        setSlideWidth(panelOn ? 100 : 0);
        setPanelMounted(panelOn);
      });
      wasOpen.current = panelOn;
      return;
    }
    if (!panelOn) {
      queueMicrotask(() => setSlideWidth(0));
      wasOpen.current = false;
      return;
    }
    queueMicrotask(() => setPanelMounted(true));
    if (!wasOpen.current) {
      queueMicrotask(() => setSlideWidth(0));
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setSlideWidth(panelPct);
          wasOpen.current = true;
        });
      });
      return () => window.cancelAnimationFrame(id);
    }
    queueMicrotask(() => setSlideWidth(panelPct));
  }, [panelOn, immersive, panelPct, mobile, canPanel]);

  if (mobile) {
    const withPanel = canPanel && panelOn;
    const active: MobileSurface =
      mobileSurface === "panel" && withPanel ? "panel" : "chat";

    return (
      <MobileContentPager
        withPanel={withPanel}
        active={active}
        chatPane={
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", MOBILE_APP_BG)}>
            {children}
          </div>
        }
        panelPane={
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", MOBILE_APP_BG)}>
            <ContextPanel />
          </div>
        }
      />
    );
  }

  const showPanelColumn = canPanel && (panelMounted || panelOn);
  const showPanelBody = panelOn || slideWidth > 0;
  const showResize =
    showPanelColumn && slideWidth > 0 && !immersive && panelOn;
  const livePanelWidth =
    dragging && panelOn && !immersive ? panelPct : slideWidth;
  const animateLayout = !dragging && !immersive;

  const onPanelWidthTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "width") return;
    if (!panelOn && slideWidth === 0) setPanelMounted(false);
  };

  return (
    <div id="courier-main" className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <RightPanelToggleDock />
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          immersive ? "w-[22.5rem] shrink-0" : "min-w-0 flex-1",
          !immersive &&
            showPanelColumn &&
            animateLayout &&
            "transition-[flex-basis] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
      >
        {hideTopRail ? null : <TopRail />}
        {children}
      </div>
      {showPanelColumn ? (
        <>
          {showResize ? <ResizeHandle /> : null}
          <div
            onTransitionEnd={onPanelWidthTransitionEnd}
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden",
              immersive ? "flex-1" : "shrink-0",
              !immersive &&
                animateLayout &&
                "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              livePanelWidth > 0 && !floating && "border-l border-border bg-sidebar",
              livePanelWidth === 0 && !panelOn && "pointer-events-none",
            )}
            style={immersive ? undefined : { width: `${livePanelWidth}%` }}
          >
            {showPanelBody ? <ContextPanel /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
