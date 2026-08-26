"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
import {
  DESKTOP_DRAG,
  DESKTOP_NO_DRAG,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

export function WindowChrome({
  clearTrafficLights = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  className?: string;
}) {
  const desktop = useDesktopShell();
  const dragSpacer = desktop ? (
    <div
      className="min-w-2 flex-1 self-stretch"
      style={DESKTOP_DRAG}
      aria-hidden
    />
  ) : (
    <div className="min-w-2 flex-1" aria-hidden />
  );

  return (
    <div
      style={desktop ? DESKTOP_NO_DRAG : undefined}
      className={cn(
        "flex shrink-0 items-center gap-1 pr-3",
        clearTrafficLights
          ? "h-[var(--desktop-titlebar,52px)] pl-[var(--desktop-traffic-clear,80px)]"
          : "h-11 px-3",
        className,
      )}
    >
      <NavToggle />
      <HistoryButtons dragSpacer={dragSpacer} />
    </div>
  );
}

function HistoryButtons({ dragSpacer }: { dragSpacer: ReactNode }) {
  const { canGoBack, canGoForward, goBack, goForward, openOverlay } = useApp();
  const desktop = useDesktopShell();

  return (
    <div
      className="flex min-w-0 flex-1 items-center"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
    >
      <button
        type="button"
        aria-label="Search"
        style={desktop ? DESKTOP_NO_DRAG : undefined}
        onClick={() => openOverlay("search")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {dragSpacer}
      <div
        className="flex items-center"
        style={desktop ? DESKTOP_NO_DRAG : undefined}
      >
        <button
          type="button"
          aria-label="Back"
          style={desktop ? DESKTOP_NO_DRAG : undefined}
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
          style={desktop ? DESKTOP_NO_DRAG : undefined}
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
