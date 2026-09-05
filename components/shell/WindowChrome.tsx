"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { NavToggle } from "@/components/shell/NavToggle";
import { useApp } from "@/components/app/AppProvider";
import {
  DESKTOP_DRAG,
  DESKTOP_NO_DRAG,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

const headerIconClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground";

export function WindowChrome({
  clearTrafficLights = false,
  hideHistory = false,
  className,
}: {
  /** Pad past macOS traffic lights when chrome shares their row. */
  clearTrafficLights?: boolean;
  /** Hide header actions (e.g. floating sidebar peek over project tabs). */
  hideHistory?: boolean;
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
        "relative flex shrink-0 items-center gap-1 pr-3",
        clearTrafficLights
          ? "h-[var(--desktop-titlebar,52px)] pl-[var(--desktop-traffic-clear,84px)]"
          : "h-11 px-3",
        className,
      )}
    >
      <NavToggle />
      {!hideHistory ? (
        <DesktopHeaderActions dragSpacer={dragSpacer} />
      ) : (
        dragSpacer
      )}
    </div>
  );
}

function DesktopHeaderActions({ dragSpacer }: { dragSpacer: ReactNode }) {
  const { openOverlay } = useApp();
  const desktop = useDesktopShell();

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
    >
      <button
        type="button"
        aria-label="Search"
        style={desktop ? DESKTOP_NO_DRAG : undefined}
        onClick={() => openOverlay("search")}
        className={headerIconClass}
      >
        <Search className="h-4 w-4" strokeWidth={1.7} />
      </button>
      {dragSpacer}
    </div>
  );
}
