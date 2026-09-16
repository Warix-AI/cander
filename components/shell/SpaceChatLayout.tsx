"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { TopRail } from "@/components/shell/TopRail";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { ProjectBrowserPanel } from "@/components/browser/ProjectBrowserPanel";
import { StandaloneBrowserPanel } from "@/components/browser/StandaloneBrowserPanel";
import { ConnectorViewHost } from "@/components/connectors/views/ConnectorViewHost";
import { ConnectorBrowserTopChrome } from "@/components/connectors/views/ConnectorBrowserTopChrome";
import { MobileContentPager } from "@/components/shell/MobileContentPager";
import { RightPanelToggleDock } from "@/components/shell/PanelToggle";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { MOBILE_APP_BG, SPACE_CANVAS_BG } from "@/lib/mobile-menu-styles";
import {
  consumeMobileSurfaceEnter,
  consumeSkipMobileSpaceEnter,
  getMobilePanelStackDirection,
  setMobilePanelStackDirection,
} from "@/lib/mobile-nav-transition";
import { useMobileShell } from "@/lib/use-media-query";
import {
  PANEL_RATIO_WIDE_FLOOR,
  showStandaloneBrowserPanel,
} from "@/lib/right-panel";
import {
  BROWSER_CHROME_BG,
  SHELL_FLOAT_PAD,
  SHELL_G3_RADIUS,
  SHELL_ISLAND,
  useShellStyle,
} from "@/lib/shell-chrome";
import { isDockChatSpace } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import type { MobileSurface } from "@/lib/types";

/**
 * Space stays mounted. On desktop, chat grows while space shrinks to a panel.
 * On mobile: menu · chat · space — three full screens that translate.
 */
export function SpaceChatLayout() {
  const {
    standaloneBrowserOpen,
    standaloneBrowserEphemeral,
    view,
    spaceId,
    drafting,
    thread,
    panelMode,
    panelRatio,
    dragging,
    mobileSurface,
    mobileContentSurface,
    projectId,
    connectorId,
    expandedLayout,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const chatActive = drafting || Boolean(thread);
  const chatArmed =
    (isDockChatSpace(spaceId) || Boolean(connectorId)) && chatActive;
  const showStandaloneBrowser = showStandaloneBrowserPanel({
    standaloneBrowserOpen,
    standaloneBrowserEphemeral,
    view,
    spaceId,
    projectId,
  });
  const panelOn = panelMode !== "collapsed";
  // expandedLayout = fullscreen app (chat column closed); restore snaps prior width.
  const chatOpen = chatArmed && !expandedLayout;
  const spaceOpen = !chatArmed || panelOn || expandedLayout;
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, PANEL_RATIO_WIDE_FLOOR) * 100
      : panelRatio * 100;
  const targetSpacePct = !spaceOpen ? 0 : !chatOpen ? 100 : panelPct;

  const [spacePct, setSpacePct] = useState(targetSpacePct);
  const wasOpen = useRef(spaceOpen);
  const prevProjectId = useRef<string | null>(projectId);
  const [skipLayoutAnimation, setSkipLayoutAnimation] = useState(false);
  /** Full-screen push into project chat (no remount — class only). */
  const [chatPush, setChatPush] = useState(false);
  /** Full-screen pop back to space home (no remount — class only). */
  const [panelPop, setPanelPop] = useState(false);
  /** After a pop, suppress SpaceDashboard's short enter so it doesn't double-animate. */
  const suppressSpaceEnter = useRef(false);
  const prevSpaceIdForEnter = useRef(spaceId);
  let skipDashboardEnter = false;
  if (prevSpaceIdForEnter.current !== spaceId) {
    skipDashboardEnter = consumeSkipMobileSpaceEnter();
    prevSpaceIdForEnter.current = spaceId;
  }

  useEffect(() => {
    setSkipLayoutAnimation(true);
    const id = window.setTimeout(() => setSkipLayoutAnimation(false), 120);
    return () => window.clearTimeout(id);
  }, [expandedLayout]);

  useEffect(() => {
    const prev = prevProjectId.current;
    if (projectId && !prev) {
      setMobilePanelStackDirection("forward");
    } else if (!projectId && prev) {
      if (getMobilePanelStackDirection() !== "back") {
        setMobilePanelStackDirection("back");
      }
    }
    prevProjectId.current = projectId;
  }, [projectId]);

  useLayoutEffect(() => {
    const enter = consumeMobileSurfaceEnter();
    if (!enter) return;
    if (enter === "forward") {
      suppressSpaceEnter.current = false;
      setPanelPop(false);
      setChatPush(true);
    } else {
      suppressSpaceEnter.current = true;
      setChatPush(false);
      setPanelPop(true);
    }
  }, [mobileSurface, projectId]);

  useEffect(() => {
    if (mobile) return;
    if (skipLayoutAnimation || immersive) {
      queueMicrotask(() => setSpacePct(spaceOpen ? targetSpacePct : 0));
      wasOpen.current = spaceOpen;
      return;
    }
    queueMicrotask(() => setSpacePct(targetSpacePct));
    wasOpen.current = spaceOpen;
  }, [spaceOpen, immersive, targetSpacePct, mobile, skipLayoutAnimation]);

  if (mobile) {
    const active: MobileSurface = mobileContentSurface;


    return (
      <MobileContentPager
        withPanel
        active={active}
        chatPane={
          <div
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              MOBILE_APP_BG,
              chatPush && "cander-mobile-push",
            )}
            onAnimationEnd={(event) => {
              if (event.target !== event.currentTarget) return;
              setChatPush(false);
            }}
          >
            <ChatColumn />
          </div>
        }
        panelPane={
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", MOBILE_APP_BG)}>
            {projectId ? (
              <div
                key={projectId}
                className="mobile-header-content flex h-full min-h-0 flex-col"
              >
                <ProjectBrowserPanel />
              </div>
            ) : connectorId ? (
              <div
                key={connectorId}
                className="flex h-full min-h-0 flex-col"
              >
                <ConnectorViewHost connectorId={connectorId} />
              </div>
            ) : showStandaloneBrowser ? (
              <StandaloneBrowserPanel />
            ) : (
              <SpaceRenderModeProvider mode="page">
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
                    panelPop && "cander-mobile-pop",
                  )}
                  onAnimationEnd={(event) => {
                    if (event.target !== event.currentTarget) return;
                    setPanelPop(false);
                  }}
                >
                  <SpaceDashboard
                    enterDirection={getMobilePanelStackDirection()}
                    animateEnter={
                      !panelPop &&
                      !suppressSpaceEnter.current &&
                      !skipDashboardEnter
                    }
                  />
                </div>
              </SpaceRenderModeProvider>
            )}
          </div>
        }
      />
    );
  }

  const liveSpacePct =
    dragging && chatOpen && spaceOpen && !immersive ? panelPct : spacePct;
  const liveChatPct = chatOpen ? Math.max(0, 100 - liveSpacePct) : 0;
  const animateLayout = true;
  const chatReady = liveChatPct > 8;
  const showResize = chatOpen && spaceOpen && !immersive;
  const spaceMode = chatOpen && spaceOpen ? "panel" : "page";
  // Keep tab chrome mounted whenever a connector is active so the right-panel
  // toggle stays put (no jump to the floating dock when the panel collapses).
  const spanConnectorChrome = floating && Boolean(connectorId);

  return (
    <div
      id="courier-main"
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 overflow-hidden",
        floating && SHELL_FLOAT_PAD,
      )}
    >
      <RightPanelToggleDock />
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          floating
            ? cn(SHELL_ISLAND, SHELL_G3_RADIUS)
            : "bg-background",
        )}
      >
        {spanConnectorChrome && connectorId ? (
          <ConnectorBrowserTopChrome connectorId={connectorId} />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden @container",
              !floating && "bg-background",
              animateLayout &&
                "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              liveChatPct === 0 && "pointer-events-none",
            )}
            style={{ width: `${liveChatPct}%` }}
            aria-hidden={liveChatPct === 0}
          >
            {chatArmed ? (
              <div
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
                  !chatReady && "pointer-events-none invisible",
                )}
                aria-hidden={!chatReady}
              >
                <TopRail />
                {/* Stay mounted while armed so send→pin survives panel width animation. */}
                <ChatColumn />
              </div>
            ) : null}
          </div>

          {showResize ? <ResizeHandle overlay={floating} /> : null}

          <div
            className={cn(
              "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden @container",
              !floating &&
                (projectId || connectorId || showStandaloneBrowser
                  ? BROWSER_CHROME_BG
                  : SPACE_CANVAS_BG),
              !floating && chatOpen && liveChatPct > 0 && "border-l border-border/40",
              !spaceOpen && "invisible pointer-events-none",
            )}
            aria-hidden={!spaceOpen}
          >
            <SpaceRenderModeProvider mode={spaceMode}>
              <div
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  projectId || connectorId || showStandaloneBrowser
                    ? "overflow-hidden"
                    : "overflow-y-auto",
                )}
              >
                {projectId ? (
                  <div
                    key={projectId}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <ProjectBrowserPanel />
                  </div>
                ) : connectorId ? (
                  <div
                    key={connectorId}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    <ConnectorViewHost
                      connectorId={connectorId}
                      hideTopChrome={spanConnectorChrome}
                    />
                  </div>
                ) : showStandaloneBrowser ? (
                  <StandaloneBrowserPanel />
                ) : (
                  <SpaceDashboard enterDirection={getMobilePanelStackDirection()} />
                )}
              </div>
            </SpaceRenderModeProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
