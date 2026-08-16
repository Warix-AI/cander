"use client";

import { Maximize2, Minimize2, PanelRight, Share } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { NavToggle } from "@/components/shell/NavToggle";
import { isChatSpace } from "@/lib/spaces";
import { cn } from "@/lib/utils";

export function TopRail() {
  const {
    product,
    view,
    thread,
    spaceId,
    drafting,
    sidebarOpen,
    mobileNav,
    panelMode,
    setPanelMode,
  } = useApp();

  const panelOpen = panelMode !== "collapsed" && view === "chat";
  const canPanel =
    product === "courier" &&
    view === "chat" &&
    (Boolean(thread) || drafting || isChatSpace(spaceId));

  return (
    <header className="flex h-11 shrink-0 items-center justify-end gap-1 bg-background px-2">
      <NavToggle
        className={cn(
          "mr-auto",
          sidebarOpen && "lg:hidden",
          mobileNav && "max-lg:hidden",
        )}
      />

      {product === "courier" && view === "chat" && (thread || drafting) ? (
        <button
          type="button"
          className="hidden h-8 items-center rounded-lg px-2.5 text-[12px] text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground sm:inline-flex"
        >
          <Share className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.6} />
          Share
        </button>
      ) : null}

      {product === "courier" && view === "chat" && (thread || drafting) ? (
        <button
          type="button"
          aria-label={
            panelMode === "immersive" ? "Exit full surface" : "Widen panel"
          }
          onClick={() =>
            setPanelMode(panelMode === "immersive" ? "split" : "immersive")
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
        >
          {panelMode === "immersive" ? (
            <Minimize2 className="h-4 w-4" strokeWidth={1.6} />
          ) : (
            <Maximize2 className="h-4 w-4" strokeWidth={1.6} />
          )}
        </button>
      ) : null}

      {product === "courier" ? (
        <button
          type="button"
          aria-label={panelOpen ? "Close right panel" : "Open right panel"}
          disabled={!canPanel}
          onClick={() => setPanelMode(panelOpen ? "collapsed" : "split")}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200",
            !canPanel
              ? "text-muted-foreground/40"
              : panelOpen
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <PanelRight className="h-4 w-4" strokeWidth={1.6} />
        </button>
      ) : null}
    </header>
  );
}
