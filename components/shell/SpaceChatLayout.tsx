"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { ProjectBrowserPanel } from "@/components/browser/ProjectBrowserPanel";
import { MobileContentPager } from "@/components/shell/MobileContentPager";
import { PanelToggle, RightPanelToggleDock } from "@/components/shell/PanelToggle";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { MOBILE_APP_BG } from "@/lib/mobile-menu-styles";
import { useShellStyle } from "@/lib/shell-chrome";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { MobileSurface } from "@/lib/types";

/**
 * Space stays mounted. On desktop, chat grows while space shrinks to a panel.
 * On mobile: menu · chat · space — three full screens that translate.
 */
export function SpaceChatLayout() {
  const {
    drafting,
    thread,
    panelMode,
    panelRatio,
    dragging,
    mobileSurface,
    projectId,
    expandedLayout,
    expandedPinned,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const chatArmed = drafting || Boolean(thread);
  const panelOn = panelMode !== "collapsed";
  const chatOpen = chatArmed;
  const spaceOpen = !chatArmed || panelOn;
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, 0.58) * 100
      : panelRatio * 100;
  const targetSpacePct = !spaceOpen ? 0 : !chatOpen ? 100 : panelPct;

  const [spacePct, setSpacePct] = useState(targetSpacePct);
  const wasOpen = useRef(spaceOpen);

  useEffect(() => {
    if (mobile) return;
    if (immersive) {
      queueMicrotask(() => setSpacePct(spaceOpen ? 100 : 0));
      wasOpen.current = spaceOpen;
      return;
    }
    if (!spaceOpen) {
      queueMicrotask(() => setSpacePct(0));
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      queueMicrotask(() => setSpacePct(0));
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setSpacePct(targetSpacePct);
          wasOpen.current = true;
        });
      });
      return () => window.cancelAnimationFrame(id);
    }
    queueMicrotask(() => setSpacePct(targetSpacePct));
  }, [spaceOpen, immersive, targetSpacePct, mobile]);

  if (mobile) {
    const active: MobileSurface =
      mobileSurface === "panel" ? "panel" : "chat";

    return (
      <MobileContentPager
        withPanel
        active={active}
        chatPane={
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", MOBILE_APP_BG)}>
            <ChatColumn />
          </div>
        }
        panelPane={
          <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", MOBILE_APP_BG)}>
            {projectId ? (
              <div key={projectId} className="cander-surface-enter flex h-full min-h-0 flex-col">
                <ProjectBrowserPanel />
              </div>
            ) : (
              <SpaceRenderModeProvider mode="page">
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  <SpaceDashboard />
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
  const animateLayout = !dragging && !immersive;
  const pinChat =
    expandedLayout && expandedPinned && chatOpen && spaceOpen && !immersive;
  const chatReady = pinChat || liveChatPct > 8;
  const showResize = chatOpen && spaceOpen && !immersive;
  const spaceMode = chatOpen && spaceOpen ? "panel" : "page";

  return (
    <div id="courier-main" className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <RightPanelToggleDock />
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          pinChat && "w-[40%] min-w-[16rem] max-w-[28rem] shrink-0",
          animateLayout &&
            !pinChat &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          liveChatPct === 0 && !pinChat && "pointer-events-none",
        )}
        style={pinChat ? undefined : { width: `${liveChatPct}%` }}
        aria-hidden={liveChatPct === 0 && !pinChat}
      >
        {chatArmed && chatReady ? (
          <>
            <TopRail />
            <ChatColumn />
          </>
        ) : null}
      </div>

      {showResize ? <ResizeHandle /> : null}

      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-background @container",
          pinChat && "min-w-0 flex-1",
          chatOpen && liveChatPct > 0 && "border-l border-border/40",
          animateLayout &&
            !pinChat &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !spaceOpen && !pinChat && "invisible pointer-events-none",
        )}
        style={pinChat ? undefined : { width: `${liveSpacePct}%` }}
        aria-hidden={liveSpacePct === 0 && !pinChat}
      >
        {chatOpen && spaceOpen && !projectId ? (
          <div
            className={cn(
              "pointer-events-none absolute z-40 hidden h-11 items-center lg:flex",
              floating ? "top-3 right-3 px-2" : "top-0 right-0 px-3",
            )}
            style={
              floating
                ? undefined
                : { transform: "translate(-10px, 5px)" }
            }
          >
            <PanelToggle className="pointer-events-auto text-white/85 hover:bg-white/15 hover:text-white" />
          </div>
        ) : null}
        <SpaceRenderModeProvider mode={spaceMode}>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              projectId ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {projectId ? (
              <div key={projectId} className="cander-surface-enter flex min-h-0 flex-1 flex-col">
                <ProjectBrowserPanel />
              </div>
            ) : (
              <SpaceDashboard />
            )}
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
