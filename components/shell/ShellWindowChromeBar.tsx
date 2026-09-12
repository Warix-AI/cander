"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, PanelLeft, Search } from "lucide-react";
import {
  DESKTOP_DRAG,
  DESKTOP_NO_DRAG,
  DESKTOP_TITLEBAR_PX,
  DESKTOP_TRAFFIC_CLEAR_PX,
  useDesktopShell,
} from "@/lib/desktop-shell";
import { cn } from "@/lib/utils";

export const SHELL_HEADER_ICON_CLASS =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

/**
 * Presentational sidebar header row — same geometry as product WindowChrome
 * (traffic-light clear on Electron, h-11 + px-3 on web).
 */
export function ShellWindowChromeBar({
  clearTrafficLights = false,
  hideHistory = false,
  className,
  leading,
  onSearch,
  onBack,
  onForward,
  canGoBack = false,
  canGoForward = false,
}: {
  clearTrafficLights?: boolean;
  hideHistory?: boolean;
  className?: string;
  /** Usually NavToggle or a PanelLeft collapse control. */
  leading: ReactNode;
  onSearch?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
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
      style={{
        ...(desktop ? DESKTOP_NO_DRAG : undefined),
        // Hard mins — :root sets these vars to 0px; leaving the main app can
        // strip `cander-desktop`, which collapsed admin chrome to the top edge.
        ...(clearTrafficLights
          ? {
              height: `max(${DESKTOP_TITLEBAR_PX}px, var(--desktop-titlebar, ${DESKTOP_TITLEBAR_PX}px))`,
              paddingLeft: `max(${DESKTOP_TRAFFIC_CLEAR_PX}px, var(--desktop-traffic-clear, ${DESKTOP_TRAFFIC_CLEAR_PX}px))`,
            }
          : undefined),
      }}
      className={cn(
        "relative flex shrink-0 items-center gap-1 pr-3",
        clearTrafficLights ? undefined : "h-11 px-3",
        className,
      )}
    >
      {leading}
      {!hideHistory ? (
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
          style={desktop ? DESKTOP_NO_DRAG : undefined}
        >
          <button
            type="button"
            aria-label="Search"
            style={desktop ? DESKTOP_NO_DRAG : undefined}
            onClick={onSearch}
            disabled={!onSearch}
            className={SHELL_HEADER_ICON_CLASS}
          >
            <Search className="h-4 w-4" strokeWidth={1.7} />
          </button>
          {dragSpacer}
          <button
            type="button"
            aria-label="Back"
            disabled={!canGoBack}
            style={desktop ? DESKTOP_NO_DRAG : undefined}
            onClick={onBack}
            className={SHELL_HEADER_ICON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="Forward"
            disabled={!canGoForward}
            style={desktop ? DESKTOP_NO_DRAG : undefined}
            onClick={onForward}
            className={SHELL_HEADER_ICON_CLASS}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      ) : (
        dragSpacer
      )}
    </div>
  );
}

/** PanelLeft control matching NavToggle chrome (for shells without AppProvider). */
export function ShellNavToggleButton({
  onClick,
  label = "Close left panel",
}: {
  onClick: () => void;
  label?: string;
}) {
  const desktop = useDesktopShell();
  return (
    <button
      type="button"
      style={desktop ? DESKTOP_NO_DRAG : undefined}
      aria-label={label}
      onClick={onClick}
      className={SHELL_HEADER_ICON_CLASS}
    >
      <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
