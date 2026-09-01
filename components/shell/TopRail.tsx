"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
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
    deleteChat,
    spaceId,
    connectorId,
    projectId,
    jobId,
    skillId,
  } = useApp();
  const mobile = useMobileShell();
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);

  const spaceChatOpen =
    view === "space" && (drafting || Boolean(thread));
  const chatPanelOpen = view === "chat" && panelMode !== "collapsed";
  const showMobileSurfaceToggle =
    mobile && (spaceChatOpen || chatPanelOpen);
  const dockVisible =
    !mobile &&
    panelMode === "collapsed" &&
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
        dockVisible ? "pr-14" : "pr-2",
      )}
    >
      {showMobileSurfaceToggle ? <MobileSurfaceToggle /> : null}
      {spaceChatOpen ? (
        <>
          {thread ? (
            <button
              type="button"
              aria-label="Delete chat"
              onClick={() => {
                if (thread.projectId) {
                  setDeleteBlockedOpen(true);
                  return;
                }
                deleteChat(thread.id);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.6} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close chat"
            onClick={() => closeSpaceChat()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </>
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
      {deleteBlockedOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/20 pt-24"
          onClick={() => setDeleteBlockedOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] border border-border bg-background p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[14px] font-medium tracking-[-0.01em]">
              Can&apos;t delete chat
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              This chat is tied to its project. Delete the project to remove it.
            </p>
            <button
              type="button"
              onClick={() => setDeleteBlockedOpen(false)}
              className="mt-4 h-9 rounded-[10px] bg-foreground px-3.5 text-[13px] font-medium text-background"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
