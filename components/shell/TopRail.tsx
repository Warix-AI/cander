"use client";

import { PanelRight, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MobileSurfaceToggle } from "@/components/shell/MobileSurfaceChrome";
import { NavToggle } from "@/components/shell/NavToggle";
import { PinControl } from "@/components/shell/PinControl";
import { useMobileShell } from "@/lib/use-media-query";
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
    setMobileSurface,
    sidebarOpen,
    mobileNav,
    closeSpaceChat,
  } = useApp();
  const mobile = useMobileShell();

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
  const chatPanelOpen =
    product === "courier" &&
    view === "chat" &&
    panelMode !== "collapsed" &&
    (drafting || Boolean(thread));
  const showMobileSurfaceToggle =
    mobile && (spaceChatOpen || chatPanelOpen);
  const pinTarget = thread
    ? ({ kind: "thread" as const, id: thread.id })
    : projectId
      ? ({ kind: "project" as const, id: projectId })
      : spaceId === "connectors" && connectorId
        ? ({ kind: "connector" as const, id: connectorId })
        : null;

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-end gap-1 bg-background px-2",
        !showPanelBtn &&
          !pinTarget &&
          !spaceChatOpen &&
          !showMobileSurfaceToggle &&
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
        <PinControl
          kind={pinTarget.kind}
          id={pinTarget.id}
          alwaysVisible
        />
      ) : null}
      {showPanelBtn ? (
        <button
          type="button"
          aria-label="Open right panel"
          onClick={() => {
            setMobileSurface("chat");
            setPanelMode("split");
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground max-lg:hidden"
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
      {showMobileSurfaceToggle ? <MobileSurfaceToggle /> : null}
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
      {chatPanelOpen && mobile ? (
        <button
          type="button"
          aria-label="Close panel"
          onClick={() => setPanelMode("collapsed")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
    </header>
  );
}
