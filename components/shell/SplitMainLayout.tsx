"use client";

import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { RightPanelToggleDock } from "@/components/shell/PanelToggle";
import { useApp } from "@/components/app/AppProvider";
import { canUseRightPanel } from "@/lib/right-panel";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

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

  const mobileExclusive = mobile && panelOn;
  const showChat = !mobileExclusive || mobileSurface === "chat";
  const showPanel = !mobileExclusive || mobileSurface === "panel";

  useEffect(() => {
    if (mobileExclusive) {
      setSlideWidth(showPanel ? 100 : 0);
      setPanelMounted(showPanel);
      wasOpen.current = panelOn;
      return;
    }
    if (immersive) {
      setSlideWidth(panelOn ? 100 : 0);
      setPanelMounted(panelOn);
      wasOpen.current = panelOn;
      return;
    }
    if (!panelOn) {
      setSlideWidth(0);
      wasOpen.current = false;
      return;
    }
    setPanelMounted(true);
    if (!wasOpen.current) {
      setSlideWidth(0);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setSlideWidth(panelPct);
          wasOpen.current = true;
        });
      });
      return () => window.cancelAnimationFrame(id);
    }
    setSlideWidth(panelPct);
  }, [panelOn, immersive, panelPct, mobileExclusive, showPanel]);

  const showPanelColumn = canPanel && (panelMounted || panelOn);
  const showPanelBody = panelOn || slideWidth > 0;
  const showResize =
    showPanelColumn && slideWidth > 0 && !mobile && !immersive && panelOn;
  const livePanelWidth =
    dragging && panelOn && !immersive && !mobileExclusive ? panelPct : slideWidth;
  const animateLayout = !dragging && !mobileExclusive && !immersive;

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
          mobileExclusive
            ? showChat
              ? "min-w-0 flex-1"
              : "pointer-events-none w-0 overflow-hidden"
            : immersive
              ? "w-[22.5rem] shrink-0"
              : "min-w-0 flex-1",
          !mobileExclusive &&
            !immersive &&
            showPanelColumn &&
            animateLayout &&
            "transition-[flex-basis] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        aria-hidden={mobileExclusive && !showChat}
      >
        {hideTopRail || mobile ? null : <TopRail />}
        {showChat || !mobileExclusive ? children : null}
      </div>
      {showPanelColumn ? (
        <>
          {showResize ? <ResizeHandle /> : null}
          <div
            onTransitionEnd={onPanelWidthTransitionEnd}
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
                animateLayout &&
                "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              livePanelWidth > 0 &&
                showChat &&
                !mobileExclusive &&
                !floating &&
                "border-l border-border",
              livePanelWidth === 0 && !panelOn && "pointer-events-none",
            )}
            style={
              immersive || mobileExclusive
                ? undefined
                : { width: `${livePanelWidth}%` }
            }
            aria-hidden={mobileExclusive && !showPanel}
          >
            {showPanelBody && (showPanel || !mobileExclusive) ? (
              <ContextPanel />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
