"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { MobileArmedPanelChrome } from "@/components/shell/MobileSurfaceChrome";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { InviteBanner } from "@/components/overlays/InviteWall";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Space stays mounted. On new chat it shrinks from full width to the right
 * panel while chat grows in from the left — one continuous slide.
 * On mobile, chat and space are exclusive full-screen surfaces.
 */
export function SpaceChatLayout() {
  const {
    drafting,
    thread,
    panelMode,
    panelRatio,
    dragging,
    mobileSurface,
    closeSpaceChat,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const chatArmed = drafting || Boolean(thread);
  const chatOpen = chatArmed && panelMode !== "collapsed";
  const immersive = panelMode === "immersive";
  const wide = panelMode === "wide";
  const panelPct = immersive
    ? 100
    : wide
      ? Math.max(panelRatio, 0.58) * 100
      : panelRatio * 100;

  const [spacePct, setSpacePct] = useState(chatOpen ? panelPct : 100);
  const wasOpen = useRef(chatOpen);

  useEffect(() => {
    if (mobile && chatOpen) {
      setSpacePct(mobileSurface === "panel" ? 100 : 0);
      wasOpen.current = true;
      return;
    }
    if (immersive) {
      setSpacePct(chatOpen ? 100 : 100);
      wasOpen.current = chatOpen;
      return;
    }
    if (!chatOpen) {
      setSpacePct(100);
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      // Start from full width, then slide to panel size on the next frame.
      setSpacePct(100);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setSpacePct(panelPct);
          wasOpen.current = true;
        });
      });
      return () => window.cancelAnimationFrame(id);
    }
    setSpacePct(panelPct);
  }, [chatOpen, immersive, panelPct, mobile, mobileSurface]);

  const chatPct = chatOpen ? Math.max(0, 100 - spacePct) : 0;
  // Don't mount the composer until the pane has real width — otherwise the
  // textarea measures at ~0px and grows to max height from a wrapped placeholder.
  const chatReady = chatPct > 8;
  const showResize = chatOpen && !mobile;
  const spaceMode =
    mobile && chatOpen && mobileSurface === "panel"
      ? "page"
      : chatOpen
        ? "panel"
        : "page";

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          !dragging &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          chatPct === 0 && "pointer-events-none",
        )}
        style={{ width: `${chatPct}%` }}
        aria-hidden={chatPct === 0}
      >
        {chatArmed && chatReady ? (
          <>
            <TopRail />
            <InviteBanner />
            <ChatColumn />
          </>
        ) : null}
      </div>

      {showResize ? <ResizeHandle /> : null}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          chatOpen && chatPct > 0 && !floating && "border-l border-border",
          !dragging &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          spacePct === 0 && "pointer-events-none",
        )}
        style={{ width: `${spacePct}%` }}
        aria-hidden={spacePct === 0}
      >
        <SpaceRenderModeProvider mode={spaceMode}>
          {mobile && chatOpen && mobileSurface === "panel" ? (
            <MobileArmedPanelChrome onClose={closeSpaceChat} />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {chatArmed && chatReady ? null : <InviteBanner />}
            <SpaceDashboard />
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
