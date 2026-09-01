"use client";

import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MobileSurfaceToggle } from "@/components/shell/MobileSurfaceChrome";
import { canUseRightPanel } from "@/lib/right-panel";
import { useMobileShell } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export function TopRail() {
  const {
    view,
    drafting,
    thread,
    panelMode,
    setPanelMode,
    closeSpaceChat,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
  } = useApp();
  const mobile = useMobileShell();

  const spaceChatOpen =
    view === "space" && (drafting || Boolean(thread));
  const chatPanelOpen = view === "chat" && panelMode !== "collapsed";
  const showMobileSurfaceToggle =
    mobile && (spaceChatOpen || chatPanelOpen);
  const panelDockRoom =
    !mobile &&
    canUseRightPanel({
      view,
      thread,
      drafting,
      spaceId,
      connectorId,
      projectId,
      jobId,
      skillId,
    });

  if (!mobile && !spaceChatOpen) return null;

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-end gap-1 bg-background pl-2",
        panelDockRoom ? "pr-14" : "pr-2",
      )}
    >
      {showMobileSurfaceToggle ? <MobileSurfaceToggle /> : null}
      {spaceChatOpen && panelMode !== "collapsed" ? (
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => closeSpaceChat()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
      {chatPanelOpen && mobile ? (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setPanelMode("collapsed")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
    </header>
  );
}
