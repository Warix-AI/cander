"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { InviteBanner } from "@/components/overlays/InviteWall";
import { cn } from "@/lib/utils";

/**
 * Space stays mounted. On new chat it shrinks from full width to the right
 * panel while chat grows in from the left — one continuous slide.
 */
export function SpaceChatLayout() {
  const { drafting, thread, panelMode, panelRatio, dragging } = useApp();
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
  }, [chatOpen, immersive, panelPct]);

  const chatPct = chatOpen ? Math.max(0, 100 - spacePct) : 0;
  // Don't mount the composer until the pane has real width — otherwise the
  // textarea measures at ~0px and grows to max height from a wrapped placeholder.
  const chatReady = chatPct > 8;

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          !dragging &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        style={{ width: `${chatPct}%` }}
      >
        {chatArmed && chatReady ? (
          <>
            <TopRail />
            <InviteBanner />
            <ChatColumn />
          </>
        ) : null}
      </div>

      {chatOpen ? <ResizeHandle /> : null}

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          chatOpen && "border-l border-border",
          !dragging &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        )}
        style={{ width: `${spacePct}%` }}
      >
        <SpaceRenderModeProvider mode={chatOpen ? "panel" : "page"}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {chatArmed ? null : <InviteBanner />}
            <SpaceDashboard />
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
