"use client";

import { PanelRight, Pin, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import { isChatSpace } from "@/lib/spaces";
import { cn } from "@/lib/utils";

export function TopRail() {
  const {
    product,
    view,
    thread,
    projectId,
    spaceId,
    connectorId,
    drafting,
    panelMode,
    setPanelMode,
    sidebarOpen,
    mobileNav,
    isPinned,
    togglePin,
    closeSpaceChat,
  } = useApp();

  const panelOpen = panelMode !== "collapsed" && view === "chat";
  const canPanel =
    product === "courier" &&
    view === "chat" &&
    (Boolean(thread) || drafting || isChatSpace(spaceId));
  const showPanelBtn = canPanel && !panelOpen;
  const spaceChatOpen =
    product === "courier" &&
    view === "space" &&
    panelMode !== "collapsed" &&
    (drafting || Boolean(thread));
  const pinTarget = thread
    ? ({ kind: "thread" as const, id: thread.id })
    : projectId
      ? ({ kind: "project" as const, id: projectId })
      : spaceId === "connectors" && connectorId
        ? ({ kind: "connector" as const, id: connectorId })
        : null;
  const pinned = pinTarget ? isPinned(pinTarget.kind, pinTarget.id) : false;

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-end gap-1 bg-background px-2",
        !showPanelBtn &&
          !pinTarget &&
          !spaceChatOpen &&
          sidebarOpen &&
          "lg:hidden",
      )}
    >
      <NavToggle
        className={cn(
          "mr-auto",
          sidebarOpen && "lg:hidden",
          mobileNav && "max-lg:hidden",
        )}
      />
      {pinTarget ? (
        <button
          type="button"
          aria-label={pinned ? "Unpin" : "Pin"}
          aria-pressed={pinned}
          onClick={() => togglePin(pinTarget.kind, pinTarget.id)}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-muted",
            pinned
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Pin
            className={cn("h-4 w-4", pinned && "fill-current")}
            strokeWidth={1.6}
          />
        </button>
      ) : null}
      {showPanelBtn ? (
        <button
          type="button"
          aria-label="Open right panel"
          onClick={() => setPanelMode("split")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
      {spaceChatOpen ? (
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => closeSpaceChat()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
    </header>
  );
}
