"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PlatformChatColumn } from "@/components/platform/PlatformChatDock";
import { PlatformMain } from "@/components/platform/PlatformShell";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { MobileArmedPanelChrome } from "@/components/shell/MobileSurfaceChrome";
import { RecentsView } from "@/components/shell/RecentsView";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { InviteBanner } from "@/components/overlays/InviteWall";
import { useMobileShell } from "@/lib/use-media-query";
import { useShellStyle } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/**
 * Development mirror of SpaceChatLayout: the current tab stays mounted and
 * slides into the right pane while chat grows in from the left.
 * On mobile, chat and tab are exclusive full-screen surfaces.
 */
export function PlatformChatLayout() {
  const {
    platformDockOpen,
    platformNav,
    panelRatio,
    dragging,
    mobileSurface,
    setPlatformDockOpen,
  } = useApp();
  const mobile = useMobileShell();
  const floating = useShellStyle() === "floating";
  const chatOpen = platformDockOpen;
  const panelPct = Math.max(panelRatio, 0.42) * 100;

  const [spacePct, setSpacePct] = useState(chatOpen ? panelPct : 100);
  const wasOpen = useRef(chatOpen);

  useEffect(() => {
    if (mobile && chatOpen) {
      setSpacePct(mobileSurface === "panel" ? 100 : 0);
      wasOpen.current = true;
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
  }, [chatOpen, panelPct, mobile, mobileSurface]);

  const chatPct = chatOpen ? Math.max(0, 100 - spacePct) : 0;
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
        {chatOpen && chatReady ? (
          <>
            <InviteBanner />
            <PlatformChatColumn />
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
            <MobileArmedPanelChrome
              onClose={() => setPlatformDockOpen(false)}
            />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {chatOpen && chatReady ? null : <InviteBanner />}
            {platformNav === "recents" ? <RecentsView /> : <PlatformMain />}
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
