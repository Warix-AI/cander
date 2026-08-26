"use client";

import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function WindowChrome({
  clearTrafficLights = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  className?: string;
}) {
  return (
    // Never mark this row as a drag region — drag parents steal clicks even when
    // children set no-drag (and stale Electron overlays compound the problem).
    <div
      data-desktop-no-drag=""
      className={cn(
        "flex shrink-0 items-center gap-1 pr-3",
        clearTrafficLights
          ? "h-[var(--desktop-titlebar,52px)] pl-[var(--desktop-traffic-clear,80px)]"
          : "h-11 px-3",
        className,
      )}
    >
      <NavToggle />
      <HistoryButtons />
    </div>
  );
}

function HistoryButtons() {
  const { canGoBack, canGoForward, goBack, goForward, openOverlay } = useApp();

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <button
        type="button"
        aria-label="Search"
        onClick={() => openOverlay("search")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      <div className="ml-auto flex items-center">
        <button
          type="button"
          aria-label="Back"
          disabled={!canGoBack}
          onClick={goBack}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
            canGoBack
              ? "hover:bg-sidebar-accent hover:text-foreground"
              : "opacity-35",
          )}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!canGoForward}
          onClick={goForward}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200",
            canGoForward
              ? "hover:bg-sidebar-accent hover:text-foreground"
              : "opacity-35",
          )}
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.7} />
        </button>
      </div>
    </div>
  );
}
