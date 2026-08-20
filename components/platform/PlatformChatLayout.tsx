"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import { PlatformChatColumn } from "@/components/platform/PlatformChatDock";
import { PlatformMain } from "@/components/platform/PlatformShell";
import { ResizeHandle } from "@/components/shell/ContextPanel";
import { RecentsView } from "@/components/shell/RecentsView";
import { SpaceRenderModeProvider } from "@/components/spaces/SpaceRenderMode";
import { InviteBanner } from "@/components/overlays/InviteWall";
import { cn } from "@/lib/utils";

/**
 * Development mirror of SpaceChatLayout: the current tab stays mounted and
 * slides into the right pane while chat grows in from the left.
 */
export function PlatformChatLayout() {
  const { platformDockOpen, platformNav, panelRatio, dragging } = useApp();
  const chatOpen = platformDockOpen;
  const panelPct = Math.max(panelRatio, 0.42) * 100;

  const [spacePct, setSpacePct] = useState(chatOpen ? panelPct : 100);
  const wasOpen = useRef(chatOpen);

  useEffect(() => {
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
  }, [chatOpen, panelPct]);

  const chatPct = chatOpen ? Math.max(0, 100 - spacePct) : 0;
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
        {chatOpen && chatReady ? (
          <>
            <InviteBanner />
            <PlatformChatColumn />
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
            {chatOpen ? null : <InviteBanner />}
            {platformNav === "recents" ? <RecentsView /> : <PlatformMain />}
          </div>
        </SpaceRenderModeProvider>
      </div>
    </div>
  );
}
