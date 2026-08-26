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

  // Mobile: both panes stay full-size and translate — no width expand/collapse.
  const mobilePager = mobile && panelOn && canPanel;
  const showChat = !mobilePager || mobileSurface === "chat";
  const showPanel = !mobilePager || mobileSurface === "panel";

  useEffect(() => {
    if (mobilePager) {
      setPanelMounted(true);
      wasOpen.current = true;
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
  }, [panelOn, immersive, panelPct, mobilePager]);

  const showPanelColumn = canPanel && (panelMounted || panelOn);
  const showPanelBody = panelOn || slideWidth > 0 || mobilePager;
  const showResize =
    showPanelColumn && slideWidth > 0 && !mobile && !immersive && panelOn;
  const livePanelWidth =
    dragging && panelOn && !immersive && !mobilePager ? panelPct : slideWidth;
  const animateLayout = !dragging && !mobilePager && !immersive;

  const onPanelWidthTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== "width") return;
    if (!panelOn && slideWidth === 0) setPanelMounted(false);
  };

  if (mobilePager) {
    const onPanel = mobileSurface === "panel";
    return (
      <div
        id="courier-main"
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <div
          className="flex h-full w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
          style={{ transform: `translate3d(${onPanel ? "-50%" : "0"}, 0, 0)` }}
        >
          <div
            className="flex h-full w-1/2 min-w-0 flex-col"
            aria-hidden={onPanel}
          >
            {children}
          </div>
          <div
            className="flex h-full w-1/2 min-w-0 flex-col overflow-hidden"
            aria-hidden={!onPanel}
          >
            <ContextPanel />
          </div>
        </div>
      </div>
    );
  }

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
        {hideTopRail || mobile ? null : <TopRail />}
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
              livePanelWidth > 0 &&
                showChat &&
                !floating &&
                "border-l border-border",
              livePanelWidth === 0 && !panelOn && "pointer-events-none",
            )}
            style={immersive ? undefined : { width: `${livePanelWidth}%` }}
            aria-hidden={!showPanel}
          >
            {showPanelBody ? <ContextPanel /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
