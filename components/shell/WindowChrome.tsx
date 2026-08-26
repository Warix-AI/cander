"use client";

import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function WindowChrome({
  clearTrafficLights = false,
  trafficClearPx = 78,
  compact = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  trafficClearPx?: number;
  /** Tighter gap between search and history (condensed floating menu). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center pr-3",
        clearTrafficLights ? "pl-0" : "px-3",
        compact ? "gap-0.5" : "gap-1",
        className,
      )}
      style={
        clearTrafficLights
          ? { paddingLeft: Math.max(12, trafficClearPx) }
          : undefined
      }
    >
      <NavToggle />
      <HistoryButtons compact={compact} />
    </div>
  );
}

function HistoryButtons({ compact = false }: { compact?: boolean }) {
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
      <div
        className={cn(
          "ml-auto flex items-center",
          compact ? "gap-0" : "gap-0",
        )}
      >
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
