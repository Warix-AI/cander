"use client";

import { X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { MobileSurfaceToggle } from "@/components/shell/MobileSurfaceChrome";
import { useMobileShell } from "@/lib/use-media-query";

export function TopRail() {
  const {
    view,
    drafting,
    thread,
    panelMode,
    setPanelMode,
    closeSpaceChat,
  } = useApp();
  const mobile = useMobileShell();

  const spaceChatOpen =
    view === "space" &&
    panelMode !== "collapsed" &&
    (drafting || Boolean(thread));
  const chatPanelOpen = view === "chat" && panelMode !== "collapsed";
  const showMobileSurfaceToggle =
    mobile && (spaceChatOpen || chatPanelOpen);

  if (!mobile && !spaceChatOpen) return null;

  return (
    <header className="flex h-11 shrink-0 items-center justify-end gap-1 bg-background px-2">
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
    </header>
  );
}
