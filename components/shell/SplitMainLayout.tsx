"use client";

import { useEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { ContextPanel, ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { RightPanelToggleDock } from "@/components/shell/PanelToggle";
import { MobileContentPager } from "@/components/shell/MobileContentPager";
import { useApp } from "@/components/app/AppProvider";
import {
  canUseRightPanel,
  NEW_CHAT_CHOICE_PANEL_RATIO,
  PANEL_RATIO_WIDE_FLOOR,
  PINNED_CHAT_WIDTH,
} from "@/lib/right-panel";
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
  // Compact only for home new-chat choice (“What would you like to do?”).
  const choicePanel = view === "chat" && !spaceId && !projectId;
  const panelPct = immersive
    ? 100
    : choicePanel
      ? NEW_CHAT_CHOICE_PANEL_RATIO * 100
      : wide
        ? Math.max(panelRatio, PANEL_RATIO_WIDE_FLOOR) * 100
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
  const openAnimRef = useRef<number | null>(null);

  useEffect(() => {
    if (mobile) {
      queueMicrotask(() => setPanelMounted(canPanel && panelOn));
      return;
    }

    if (openAnimRef.current != null) {
      window.cancelAnimationFrame(openAnimRef.current);
      openAnimRef.current = null;
    }

    queueMicrotask(() => {
      if (panelOn && canPanel) {
        // Mount at 0, then expand next frame so width actually animates open.
        if (!wasOpen.current) {
          setPanelMounted(true);
          setSlideWidth(0);
          openAnimRef.current = window.requestAnimationFrame(() => {
            openAnimRef.current = window.requestAnimationFrame(() => {
              setSlideWidth(panelPct);
              openAnimRef.current = null;
            });
          });
        } else {
          setPanelMounted(true);
          setSlideWidth(panelPct);
        }
      } else {
        setSlideWidth(0);
      }
      wasOpen.current = panelOn;
    });

    return () => {
      if (openAnimRef.current != null) {
        window.cancelAnimationFrame(openAnimRef.current);
        openAnimRef.current = null;
      }
    };
  }, [panelOn, immersive, panelPct, mobile, canPanel]);

  if (mobile) {
    // Keep the panel pane mounted whenever the right panel is available so
    // Chat|Panel swipe works before the first message (home New Chat).
    const withPanel = canPanel;
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
  const animateLayout = true;

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
          immersive ? PINNED_CHAT_WIDTH : "min-w-0 flex-1",
          !immersive &&
            showPanelColumn &&
            animateLayout &&
            "transition-[flex-basis] duration-[550ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
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
              "flex min-h-0 min-w-0 flex-col overflow-hidden will-change-[width]",
              immersive ? "flex-1" : "shrink-0",
              !immersive &&
                animateLayout &&
                "transition-[width] duration-[550ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              livePanelWidth > 0 && !floating && "border-l border-border/40 bg-sidebar",
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
