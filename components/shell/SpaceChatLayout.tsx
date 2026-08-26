"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { ChatColumn } from "@/components/shell/ChatColumn";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { TopRail } from "@/components/shell/TopRail";
import { SpaceDashboard } from "@/components/shell/SpaceDashboard";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Space stays mounted. On desktop, chat grows while space shrinks to a panel.
 * On mobile, chat and space are full-size pages that translate left/right.
 */
export function SpaceChatLayout() {
  const {
    drafting,
    thread,
    panelMode,
    panelRatio,
    dragging,
    mobileSurface,
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
    if (mobile) return;
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
  }, [chatOpen, immersive, panelPct, mobile]);

  // Mobile pager: both surfaces always full width, slide with translate.
  if (mobile) {
    const onPanel = !chatOpen || mobileSurface === "panel";
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
            className="flex h-full w-1/2 min-w-0 flex-col overflow-hidden bg-background"
            aria-hidden={onPanel}
          >
            {chatArmed ? <ChatColumn /> : null}
          </div>
          <div
            className="flex h-full w-1/2 min-w-0 flex-col overflow-hidden bg-background"
            aria-hidden={!onPanel}
          >
            <SpaceRenderModeProvider mode="page">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                <SpaceDashboard />
              </div>
            </SpaceRenderModeProvider>
          </div>
        </div>
      </div>
    );
  }

  const chatPct = chatOpen ? Math.max(0, 100 - spacePct) : 0;
  const liveSpacePct =
    dragging && chatOpen && !immersive ? panelPct : spacePct;
  const liveChatPct =
    dragging && chatOpen && !immersive
      ? Math.max(0, 100 - panelPct)
      : chatPct;
  const animateLayout = !dragging && !immersive;
  const chatReady = liveChatPct > 8;
  const showResize = chatOpen;
  const spaceMode = chatOpen ? "panel" : "page";

  return (
    <div id="courier-main" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          animateLayout &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          liveChatPct === 0 && "pointer-events-none",
        )}
        style={{ width: `${liveChatPct}%` }}
        aria-hidden={liveChatPct === 0}
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
          "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background @container",
          chatOpen && liveChatPct > 0 && !floating && "border-l border-border",
          animateLayout &&
            "transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          liveSpacePct === 0 && "pointer-events-none",
        )}
        style={{ width: `${liveSpacePct}%` }}
        aria-hidden={liveSpacePct === 0}
      >
        <SpaceRenderModeProvider mode={spaceMode}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <SpaceDashboard />
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
